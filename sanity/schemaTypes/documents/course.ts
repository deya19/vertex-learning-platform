import {defineArrayMember, defineField, defineType} from 'sanity'

export const course = defineType({
  name: 'course',
  title: 'Course',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', title: 'Slug', type: 'slug', options: {source: 'title', maxLength: 96}, validation: (rule) => rule.required()}),
    defineField({name: 'summary', title: 'Summary', type: 'text', rows: 4, validation: (rule) => rule.required()}),
    defineField({name: 'coverImage', title: 'Cover image', type: 'image', options: {hotspot: true}, fields: [{name: 'alt', title: 'Alt text', type: 'string', validation: (rule) => rule.required()}]}),
    defineField({name: 'level', title: 'Level', type: 'string', options: {list: [{title: 'Beginner', value: 'beginner'}, {title: 'Intermediate', value: 'intermediate'}, {title: 'Advanced', value: 'advanced'}], layout: 'radio'}, validation: (rule) => rule.required()}),
    defineField({name: 'price', title: 'Price', type: 'number', validation: (rule) => rule.min(0).required()}),
    defineField({name: 'isPopular', title: 'Popular', type: 'boolean', initialValue: false}),
    defineField({name: 'studentCount', title: 'Student count', type: 'number', validation: (rule) => rule.integer().min(0)}),
    defineField({name: 'learningOutcomes', title: "What you'll learn", type: 'array', of: [defineArrayMember({type: 'learningOutcome'})], validation: (rule) => rule.min(1).max(8)}),
    defineField({name: 'instructor', title: 'Instructor', type: 'reference', to: [{type: 'instructor'}], validation: (rule) => rule.required()}),
    defineField({name: 'category', title: 'Category', type: 'reference', to: [{type: 'category'}], validation: (rule) => rule.required()}),
    defineField({name: 'modules', title: 'Modules', type: 'array', of: [defineArrayMember({type: 'courseModule'})], validation: (rule) => rule.min(1).required()}),
  ],
  preview: {select: {title: 'title', media: 'coverImage', subtitle: 'level'}},
})
