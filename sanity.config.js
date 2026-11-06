import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import game from './sanity/schemas/game';

export default defineConfig({
  name: 'default',
  title: 'Game CMS',

  projectId: '251muu16',
  dataset: 'production',

  plugins: [structureTool()],

  schema: {
    types: [game],
  },
});