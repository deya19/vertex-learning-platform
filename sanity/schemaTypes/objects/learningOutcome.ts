import {defineArrayMember, defineField, defineType} from 'sanity'

export const learningOutcome = defineType({
  name: 'learningOutcome',
  title: 'Learning outcome',
  type: 'object',
  fields: [
    defineField({name: 'icon', title: 'Icon', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'description', title: 'Description', type: 'text', rows: 3, validation: (rule) => rule.required()}),
  ],
  preview: {select: {title: 'title', subtitle: 'description'}},
})

export const learningOutcomeMember = defineArrayMember({type: 'learningOutcome'})
