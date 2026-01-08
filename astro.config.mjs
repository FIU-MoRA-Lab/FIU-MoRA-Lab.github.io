// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';

// CHANGE THESE ⬇️
const SITE = 'https://FIU-MoRA-Lab.github.io';
const BASE = '/moralab/';

export default defineConfig({
  site: SITE,
  base: BASE,

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [mdx()],
});
