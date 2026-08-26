import {type SchemaTypeDefinition} from 'sanity'

import {category} from './documents/category'
import {course} from './documents/course'
import {instructor} from './documents/instructor'
import {lesson} from './documents/lesson'
import {courseModule} from './objects/module'
import {learningOutcome} from './objects/learningOutcome'
import {lessonResource} from './objects/resource'

export const schema: {types: SchemaTypeDefinition[]} = {
  types: [course, lesson, instructor, category, courseModule, learningOutcome, lessonResource],
}
