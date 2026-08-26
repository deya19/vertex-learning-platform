import {defineField, defineType} from 'sanity'

export const instructor = defineType({
  name: 'instructor',
  title: 'Instructor',
  type: 'document',
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', title: 'Slug', type: 'slug', options: {source: 'name', maxLength: 96}, validation: (rule) => rule.required()}),
    defineField({name: 'photo', title: 'Photo', type: 'image', options: {hotspot: true}}),
    defineField({name: 'expertise', title: 'Expertise', type: 'array', of: [{type: 'string'}], validation: (rule) => rule.min(1)}),
    defineField({name: 'bio', title: 'Bio', type: 'text', rows: 5, validation: (rule) => rule.required()}),
  ],
  preview: {select: {title: 'name', media: 'photo', subtitle: 'bio'}},
})
