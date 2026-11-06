import { defineConfig } from 'astro/config';
import sanity from '@sanity/astro';

export default defineConfig({
  integrations: [
    sanity({
      projectId: '251muu16',
      dataset: 'production',
      apiVersion: '2026-11-06',
      useCdn: false,
    }),
  ],
});