# Implementation Prompt: Preserve All Reverse-Referenced Lesson Courses

## Goal
Fix the lesson GROQ query so its course context projection does not discard valid reverse-referenced courses by selecting only the first match.

## Skills read
- `sanity-best-practices` — GROQ projections and relationship/query patterns.

## Code inspected
- `sanity/queries.ts`: `LESSON_BY_SLUG_QUERY` currently uses `[0]` on the reverse course lookup `*[_type == "course" && references(^._id)]`.
- `sanity/lib/data.ts`: `getLessonBySlug` consumes `LESSON_BY_SLUG_QUERY`, and the `Lesson.course` type currently models a single course context.
- `sanity/lib/client.ts`: lesson queries are server-side and parameterized by lesson slug.

## Decisions and assumptions
- A lesson can be referenced by more than one course, so returning every matching course context is safer and preserves data without inventing a course selection rule.
- Do not introduce a course-slug parameter because the existing lesson lookup API only accepts a lesson slug and the requested minimal fix does not require changing its callers.
- Update the corresponding `Lesson` type so the query result remains accurately typed.
- Keep the change limited to the query projection and its result type, plus this prompt required by repository workflow.

## Requirements
- Remove `[0]` from the reverse-referenced course lookup in `LESSON_BY_SLUG_QUERY`.
- Keep the existing course context projection and module hierarchy unchanged.
- Change `Lesson.course` to an array of the same course-context shape, preserving optionality.
- Do not change unrelated queries or data behavior.

## Acceptance criteria
- The lesson query returns all courses referencing the lesson.
- No reverse course lookup selects only the first match.
- TypeScript types accurately represent the returned course-context array.
- Type check, lint, and production build pass.

## Checks
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Manual test steps
1. Create or identify a lesson referenced from two courses in Sanity.
2. Run `LESSON_BY_SLUG_QUERY` for that lesson through the server data layer.
3. Confirm the returned `course` array contains both course contexts and each retains its ordered module hierarchy.
