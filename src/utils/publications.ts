const DBLP_PID = '43/2125';
const DBLP_BIB_URL = `https://dblp.org/pid/${DBLP_PID}.bib`;
const MIN_YEAR = 2014;

// @ts-ignore
import bibtexParse from '@orcid/bibtex-parse-js';

export interface Publication {
    type: string;
    key: string;
    title: string;
    authors: string[];
    year: string;
    venue: string; // Journal or Booktitle
    url?: string;
    doi?: string;
    bibtex: string;
}

function decodeLatex(val: string): string {
    if (!val) return "";
    let str = val;
    let previous = "";
    let loopCount = 0;

    // Loop to handle nested braces and repeated cleanups
    while (str !== previous && loopCount < 10) {
        previous = str;
        loopCount++;

        // 1. Remove non-functional braces around decoded chars or simple text
        // e.g. {a} -> a, {XR} -> XR
        // We use a regex that matches braces containing NO OTHER BRACES inside
        str = str.replace(/\{([^{}\\]+)\}/g, '$1');

        // 2. Decode specific accents
        // Matches: \'{a}, \'a, \"{u}, \"u, etc.
        // We handle standard single-character LaTeX accents
        str = str.replace(/\\(['"`^~=.])(?:\{([a-zA-Z])\}|([a-zA-Z]))/g, (_match, accent, char1, char2) => {
            const char = char1 || char2;
            const map: Record<string, string> = {
                "'": "\u0301", // acute
                "\"": "\u0308", // umlaut
                "`": "\u0300", // grave
                "^": "\u0302", // circumflex
                "~": "\u0303", // tilde
                "=": "\u0304", // macron
                ".": "\u0307", // dot
            };
            return (char + (map[accent] || "")).normalize('NFC');
        });

        // Handle \c{c} or \c c (cedilla)
        str = str.replace(/\\c(?:\{([a-zA-Z])\}|\s+([a-zA-Z]))/g, (match, char1, char2) => {
            const char = char1 || char2;
            if (char.toLowerCase() === 'c') return char === 'c' ? 'ç' : 'Ç';
            return match;
        });

        // Handle special chars
        str = str.replace(/\\_/g, '_');
        str = str.replace(/\\&/g, '&');
        // escaped whitespace
        str = str.replace(/\\ /g, ' ');

        // Clean up any double whitespace introduced
        str = str.replace(/\s+/g, ' ');
    }

    return str.trim();
}

function clean(val: string) {
    if (!val) return "";
    // First, decode any LaTeX entities
    let s = decodeLatex(val);

    // Remove BibTeX escape sequences (backslashes before special characters) if any remain
    // e.g. escaping that wasn't handled by decode
    // But be careful not to strip valid chars.
    // decodeLatex handles most usage. 

    return s.trim();
}

export function parseBibTex(text: string): Publication[] {
    try {
        const parsed = bibtexParse.toJSON(text);
        if (!Array.isArray(parsed)) return [];

        const entries: Publication[] = [];

        for (const entry of parsed) {
            const tags = entry.entryTags || {};
            const key = entry.citationKey;
            const type = entry.entryType;

            // Filter out CoRR (arXiv) entries if desired, mirroring original logic
            const venueRaw = tags.journal || tags.booktitle || tags.school || "";
            if (venueRaw.toLowerCase().includes('corr') || key.toLowerCase().includes('corr/')) continue;
            if (tags.eprinttype && tags.eprinttype.toLowerCase() === 'arxiv') continue;

            const yearStr = tags.year;
            const year = parseInt(yearStr);
            if (isNaN(year) || year < MIN_YEAR) continue;

            const title = clean(tags.title || "");

            // Clean authors
            // DBLP often separates by " and "
            const authorRaw = tags.author || "";
            // Replace newlines with spaces before splitting
            const normalizedAuthorRaw = authorRaw.replace(/\r?\n/g, ' ');
            const authors = normalizedAuthorRaw
                .split(/\s+and\s+/i)
                .map(clean)
                .filter((a: string) => a.length > 0);

            const venue = clean(venueRaw);

            // DOI URL construction or cleaning
            let doi = tags.doi || "";
            // Sometimes doi field is a full URL, sometimes just 10.xxx/...
            // Original logic: "If value starts with http, return as is"
            if (doi && !doi.startsWith('http')) {
                doi = clean(doi);
            }

            // Reconstruct bibtex (or use what we have, but the library parses to JSON)
            // The library doesn't easily give back the original raw chunk per entry.
            // We can reconstruct a simple one or try to slice it from original text if needed.
            // But 'bibtex' field in Publication interface seems to be used for "Copy BibTeX" feature.
            // We can reconstruct it from the parsed object or try to find it in text.
            // Finding in text is brittle. Let's reconstruct a standard BibTeX string.

            const makeBibtex = () => {
                let s = `@${type}{${key},\n`;
                for (const [k, v] of Object.entries(tags)) {
                    s += `  ${k} = {${v}},\n`;
                }
                s += `}`;
                return s;
            };

            entries.push({
                type,
                key,
                title,
                authors,
                year: String(year),
                venue,
                url: tags.url, // Keep URL as is
                doi,
                bibtex: makeBibtex()
            });
        }

        return entries;

    } catch (e) {
        console.error("Error parsing BibTeX with library:", e);
        return [];
    }
}

// Simple in-memory cache
let cache: { data: Publication[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchPublications(): Promise<Publication[]> {
    try {
        const now = Date.now();
        if (cache && now - cache.timestamp < CACHE_TTL) {
            console.log("Serving publications from cache...");
            return cache.data;
        }

        console.log(`Fetching publications from ${DBLP_BIB_URL}...`);
        const response = await fetch(DBLP_BIB_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch DBLP data: ${response.statusText}`);
        }
        const text = await response.text();
        const entries = parseBibTex(text);

        // Sort by year desc
        const sortedEntries = entries.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        cache = {
            data: sortedEntries,
            timestamp: now
        };

        return sortedEntries;

    } catch (e) {
        console.error("Error fetching publications:", e);
        // If fetch fails but we have stale cache, return it as fallback
        if (cache) {
            console.warn("Serving stale cache due to fetch error.");
            return cache.data;
        }
        return [];
    }
}

export function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-");
}
