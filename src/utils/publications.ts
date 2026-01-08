const DBLP_PID = '43/2125';
const DBLP_BIB_URL = `https://dblp.org/pid/${DBLP_PID}.bib`;
const MIN_YEAR = 2014;

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

function clean(val: string) {
    if (!val) return "";
    let s = val.trim();
    // Remove outer braces/quotes
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('"') && s.endsWith('"'))) {
        s = s.slice(1, -1);
    }
    // Remove remaining braces
    s = s.replace(/[{}]/g, '');
    // Remove BibTeX escape sequences (backslashes before special characters)
    s = s.replace(/\\(.)/g, '$1');
    return s.replace(/\s+/g, ' ').trim();
}

function parseBibTex(text: string): Publication[] {
    const entries: Publication[] = [];
    const normalized = text.replace(/\r\n/g, '\n');

    // Split by '@' ensuring we capture the entry type start
    // Splitting by '@' will give chunks where each chunk starts with the entry body
    // e.g. "article{..."
    const rawEntries = normalized.split('@');

    for (const raw of rawEntries) {
        const trimmed = raw.trim();
        if (!trimmed) continue;

        // Match type and key
        // e.g. article{DBLP:journals/..., or just article{...
        // The split consumed the '@', so we expect the type immediately
        const firstLineMatch = trimmed.match(/^([a-zA-Z]+)\s*\{\s*([^,]+),/);
        if (!firstLineMatch) continue;

        const type = firstLineMatch[1];
        const key = firstLineMatch[2];

        // Helper to extract field
        const getField = (name: string) => {
            // Field = {value} or "value"
            const regex = new RegExp(`${name}\\s*=\\s*[\\{"](.*?)[\\}"]\\s*[,}]`, 'is');
            const match = trimmed.match(regex);
            if (match) return clean(match[1]);

            // Field = value (numeric or string without quotes)
            const regexSimple = new RegExp(`${name}\\s*=\\s*([^,}\\s]+)`, 'i');
            const matchSimple = trimmed.match(regexSimple);
            return matchSimple ? clean(matchSimple[1]) : "";
        };

        const title = getField('title');
        const yearStr = getField('year');
        const year = parseInt(yearStr);

        if (isNaN(year) || year < MIN_YEAR) continue;

        const venue = getField('journal') || getField('booktitle') || getField('school') || "";

        // Filter out CoRR (arXiv)
        if (venue.toLowerCase().includes('corr') || key.toLowerCase().includes('corr/')) continue;

        const authorStr = getField('author');
        // DBLP uses " and "
        const authors = authorStr ? authorStr.split(/\s+and\s+/i).map(clean) : [];

        // Extract DOI - use raw value to preserve URLs
        const getDoiField = () => {
            // Field = {value} or "value"
            const regex = /doi\s*=\s*[\{"](.*?)[}\"][\s,}]/is;
            const match = trimmed.match(regex);
            if (match) {
                const value = match[1].trim();
                // If it's a URL, return as-is; otherwise clean it
                if (value.startsWith('http')) {
                    return value;
                }
                return clean(value);
            }
            return "";
        };
        const doiValue = getDoiField();

        entries.push({
            type,
            key,
            title,
            authors,
            year: String(year),
            venue,
            url: getField('url'),
            doi: doiValue,
            bibtex: `@${trimmed}`
        });
    }
    return entries;
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
