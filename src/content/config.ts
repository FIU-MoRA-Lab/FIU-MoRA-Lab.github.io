import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        pubDate: z.date().optional(),
        authors: z.array(z.string()).optional(),
    }),
});

const projects = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        image: z.string(),
        description: z.string(),
        points: z.array(z.string()).optional(),
        link: z.object({
            url: z.string(),
            label: z.string(),
        }).optional(),
        order: z.number().default(99),
    }),
});

const team = defineCollection({
    type: 'content',
    schema: z.object({
        name: z.string(),
        title: z.string(),
        image: z.string(),
        bio: z.string(),
        role: z.enum(['faculty', 'graduate', 'undergraduate', 'collaborators', 'alumni']),
        links: z.array(z.object({
            label: z.string(),
            url: z.string(),
        })).nullable().optional().transform(l => l ?? []),
    }),
});

export const collections = { blog, projects, team };
