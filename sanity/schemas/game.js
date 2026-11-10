import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'game',
  title: 'Game',
  type: 'document',

  fields: [
    defineField({
      name: 'title',
      title: 'Game Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'thumbnail',
      title: 'Game Thumbnail',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),

    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'gameType',
      title: 'Game Type',
      type: 'string',
      options: {
        list: [
          { title: 'Percentage', value: 'percentage' },
          { title: 'Two-round', value: 'two-round' },
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'subheading',
      title: 'Game Subheading',
      type: 'text',
    }),

    defineField({
      name: 'description',
      title: 'Game Description',
      type: 'text',
    }),

    defineField({
      name: 'unlockRequirement',
      title: 'Unlock requirement',
      type: 'number',
      validation: (Rule) => Rule.integer().min(0),
    })
  ],
});