import {defineQuery} from 'next-sanity'

const imageProjection = `{
  asset->{_id, url, metadata{lqip, dimensions}},
  alt
}`

const instructorProjection = `{_id, name, "slug": slug.current, photo${imageProjection}, expertise, bio}`
const categoryProjection = `{_id, title, "slug": slug.current, description}`
const lessonCardProjection = `{_id, title, "slug": slug.current, videoUrl, "poster": coalesce(poster, thumbnail)${imageProjection}, duration, "isFreePreview": coalesce(isFreePreview, freePreview), studentCount, description, overview, keyPoints, proTip}`

export const COURSES_QUERY = defineQuery(/* groq */ `
  *[_type == "course" && defined(slug.current)] | order(isPopular desc, title asc) {
    _id, title, "slug": slug.current, summary, coverImage${imageProjection}, level, price, isPopular, studentCount,
    learningOutcomes[]{_key, icon, title, description},
    instructor->${instructorProjection},
    category->${categoryProjection},
    modules[]{_key, title, summary, lessons[]->${lessonCardProjection}}
  }
`)

export const COURSE_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[_type == "course" && slug.current == $slug][0] {
    _id, title, "slug": slug.current, summary, coverImage${imageProjection}, level, price, isPopular, studentCount,
    learningOutcomes[]{_key, icon, title, description},
    instructor->${instructorProjection},
    category->${categoryProjection},
    modules[]{_key, title, summary, lessons[]->${lessonCardProjection}}
  }
`)

export const LESSON_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[_type == "lesson" && slug.current == $slug][0] {
    _id, title, "slug": slug.current, videoUrl, "poster": coalesce(poster, thumbnail)${imageProjection}, duration, "isFreePreview": coalesce(isFreePreview, freePreview), studentCount, description, overview,
    notes, keyPoints, proTip, resources[]{_key, type, title, description, url},
    "course": *[_type == "course" && references(^._id)] {
      _id, title, "slug": slug.current, coverImage${imageProjection},
      instructor->${instructorProjection}, category->${categoryProjection},
      modules[]{_key, title, summary, lessons[]->{_id, title, "slug": slug.current, duration}}
    }
  }
`)

export const INSTRUCTORS_QUERY = defineQuery(/* groq */ `
  *[_type == "instructor" && defined(slug.current)] | order(name asc) {
    _id, name, "slug": slug.current, photo${imageProjection}, expertise, bio
  }
`)

export const INSTRUCTOR_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[_type == "instructor" && slug.current == $slug][0] {
    _id, name, "slug": slug.current, photo${imageProjection}, expertise, bio,
    "courses": *[_type == "course" && instructor._ref == ^._id] | order(title asc) {
      _id, title, "slug": slug.current, summary, coverImage${imageProjection}, level, price, isPopular, studentCount
    }
  }
`)

export const CATEGORIES_QUERY = defineQuery(/* groq */ `
  *[_type == "category" && defined(slug.current)] | order(title asc) {
    _id, title, "slug": slug.current, description
  }
`)

export const CATEGORY_BY_SLUG_QUERY = defineQuery(/* groq */ `
  *[_type == "category" && slug.current == $slug][0] {
    _id, title, "slug": slug.current, description,
    "courses": *[_type == "course" && category._ref == ^._id] | order(title asc) {
      _id, title, "slug": slug.current, summary, coverImage${imageProjection}, level, price, isPopular, studentCount
    }
  }
`)
