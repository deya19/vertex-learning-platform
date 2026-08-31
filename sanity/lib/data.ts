import 'server-only'

import type {SanityImageSource} from '@sanity/image-url'

import {sanityFetch} from './client'
import {
  CATEGORIES_QUERY,
  CATEGORY_BY_SLUG_QUERY,
  COURSE_BY_SLUG_QUERY,
  COURSES_QUERY,
  INSTRUCTOR_BY_SLUG_QUERY,
  INSTRUCTORS_QUERY,
  LESSON_BY_SLUG_QUERY,
} from '../queries'

export type SanityImage = SanityImageSource & {alt?: string}

export type Instructor = {
  _id: string
  name: string
  slug: string
  photo?: SanityImage
  expertise?: string[]
  bio: string
}

export type Category = {_id: string; title: string; slug: string; description: string}

export type LessonCard = {
  _id: string
  title: string
  slug: string
  videoUrl: string
  poster?: SanityImage
  duration: number
  isFreePreview?: boolean
  studentCount?: number
  keyPoints?: string[]
  proTip?: string
}

export type Course = {
  _id: string
  title: string
  slug: string
  summary: string
  coverImage?: SanityImage
  level: 'beginner' | 'intermediate' | 'advanced'
  price: number
  isPopular?: boolean
  studentCount?: number
  learningOutcomes?: { _key: string; icon: string; title: string; description: string }[]
  instructor: Instructor
  category: Category
  modules: { _key: string; title: string; summary: string; lessons: LessonCard[] }[]
}

export type Lesson = LessonCard & {
  notes?: unknown[]
  resources?: { _key: string; type: string; title: string; description?: string; url: string }[]
  course?: (Pick<Course, '_id' | 'title' | 'slug' | 'coverImage' | 'instructor' | 'category'> & {
    modules: { _key: string; title: string; summary: string; lessons: Pick<LessonCard, '_id' | 'title' | 'slug' | 'duration'>[] }[]
  })[]
}

export async function getCourses() {
  return sanityFetch<Course[]>({query: COURSES_QUERY, tags: ['course', 'lesson', 'instructor', 'category']})
}

export async function getCourseBySlug(slug: string) {
  return sanityFetch<Course | null>({query: COURSE_BY_SLUG_QUERY, params: {slug}, tags: [`course:${slug}`, 'lesson', 'instructor', 'category']})
}

export async function getLessonBySlug(slug: string) {
  return sanityFetch<Lesson | null>({query: LESSON_BY_SLUG_QUERY, params: {slug}, tags: [`lesson:${slug}`, 'course', 'instructor', 'category']})
}

export async function getInstructors() {
  return sanityFetch<Instructor[]>({query: INSTRUCTORS_QUERY, tags: ['instructor']})
}

export async function getInstructorBySlug(slug: string) {
  return sanityFetch<(Instructor & {courses: Pick<Course, '_id' | 'title' | 'slug' | 'summary' | 'coverImage' | 'level' | 'price' | 'isPopular' | 'studentCount'>[]}) | null>({query: INSTRUCTOR_BY_SLUG_QUERY, params: {slug}, tags: [`instructor:${slug}`, 'course']})
}

export async function getCategories() {
  return sanityFetch<Category[]>({query: CATEGORIES_QUERY, tags: ['category']})
}

export async function getCategoryBySlug(slug: string) {
  return sanityFetch<(Category & {courses: Pick<Course, '_id' | 'title' | 'slug' | 'summary' | 'coverImage' | 'level' | 'price' | 'isPopular' | 'studentCount'>[]}) | null>({query: CATEGORY_BY_SLUG_QUERY, params: {slug}, tags: [`category:${slug}`, 'course']})
}
