import {defineArrayMember, defineField, defineType} from 'sanity'

export const lesson = defineType({
  name: 'lesson',
  title: 'Lesson',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', title: 'Slug', type: 'slug', options: {source: 'title', maxLength: 96}, validation: (rule) => rule.required()}),
    defineField({name: 'videoUrl', title: 'Video URL', type: 'url', validation: (rule) => rule.uri({scheme: ['http', 'https']}).required()}),
    defineField({name: 'poster', title: 'Poster / thumbnail', type: 'image', options: {hotspot: true}, fields: [{name: 'alt', title: 'Alt text', type: 'string', validation: (rule) => rule.required()}]}),
    defineField({name: 'duration', title: 'Duration (seconds)', type: 'number', validation: (rule) => rule.integer().positive().required()}),
    defineField({name: 'isFreePreview', title: 'Free preview', type: 'boolean', initialValue: false}),
    defineField({name: 'studentCount', title: 'Student count', type: 'number', validation: (rule) => rule.integer().min(0)}),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'Heading 2', value: 'h2'},
            {title: 'Heading 3', value: 'h3'},
            {title: 'Quote', value: 'blockquote'},
          ],
          lists: [{title: 'Bullet', value: 'bullet'}, {title: 'Numbered', value: 'number'}],
          marks: {
            decorators: [{title: 'Strong', value: 'strong'}, {title: 'Emphasis', value: 'em'}, {title: 'Code', value: 'code'}],
            annotations: [
              defineArrayMember({
                name: 'link',
                title: 'Link',
                type: 'object',
                fields: [
                  defineField({name: 'href', title: 'URL', type: 'url', validation: (rule) => rule.uri({scheme: ['http', 'https']}).required()}),
                ],
              }),
            ],
          },
        }),
      ],
    }),
    defineField({name: 'keyPoints', title: 'In this lesson you will', type: 'array', of: [defineArrayMember({type: 'string'})], validation: (rule) => rule.min(1).max(8)}),
    defineField({name: 'proTip', title: 'Pro tip', type: 'text', rows: 3}),
    defineField({name: 'resources', title: 'Resources', type: 'array', of: [defineArrayMember({type: 'lessonResource'})]}),
  ],
  preview: {select: {title: 'title', media: 'poster', subtitle: 'videoUrl'}},
})
