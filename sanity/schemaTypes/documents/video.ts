import {defineArrayMember, defineField, defineType} from 'sanity'

const timestampFields = [
  defineField({name: 'startSeconds', title: 'Start (seconds)', type: 'number', validation: (rule) => rule.integer().min(0).required()}),
]

export const video = defineType({
  name: 'video',
  title: 'Video intelligence',
  type: 'document',
  fields: [
    defineField({name: 'url', title: 'Video URL', type: 'url', validation: (rule) => rule.uri({scheme: ['http', 'https']}).required()}),
    defineField({
      name: 'chapters',
      title: 'Chapters',
      type: 'array',
      of: [defineArrayMember({type: 'object', fields: [...timestampFields, defineField({name: 'label', title: 'Label', type: 'string', validation: (rule) => rule.required()})]})],
    }),
    defineField({
      name: 'chunks',
      title: 'Transcript chunks',
      type: 'array',
      of: [defineArrayMember({type: 'object', fields: [...timestampFields, defineField({name: 'text', title: 'Text', type: 'text', rows: 3, validation: (rule) => rule.required()})]})],
    }),
  ],
  preview: {select: {title: 'url', subtitle: 'url'}},
})
