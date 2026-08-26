import {defineArrayMember, defineField, defineType} from 'sanity'

export const lessonResource = defineType({
  name: 'lessonResource',
  title: 'Resource',
  type: 'object',
  fields: [
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {list: [{title: 'Article', value: 'article'}, {title: 'Documentation', value: 'documentation'}, {title: 'Download', value: 'download'}, {title: 'Link', value: 'link'}], layout: 'dropdown'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'description', title: 'Description', type: 'text', rows: 2}),
    defineField({name: 'url', title: 'URL', type: 'url', validation: (rule) => rule.uri({scheme: ['http', 'https']}).required()}),
  ],
  preview: {select: {title: 'title', subtitle: 'type'}},
})

export const lessonResourceMember = defineArrayMember({type: 'lessonResource'})
