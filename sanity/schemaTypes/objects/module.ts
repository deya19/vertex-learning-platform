import {defineArrayMember, defineField, defineType} from 'sanity'

export const courseModule = defineType({
  name: 'courseModule',
  title: 'Module',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'summary', title: 'Summary', type: 'text', rows: 3, validation: (rule) => rule.required()}),
    defineField({
      name: 'lessons',
      title: 'Lessons',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'lesson'}]})],
      validation: (rule) => rule.min(1).required(),
    }),
  ],
  preview: {select: {title: 'title', subtitle: 'summary'}},
})
