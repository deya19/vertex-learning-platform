# Implementation Prompt: Sanity Content Model and Server Data Layer

## Goal
Implement Vertex's Sanity content model and the server-only read layer that exposes typed course, lesson, instructor, and category data to the Next.js application. Keep Sanity content authoring separate from application data access, preserve the existing public browsing boundary, and model the relationships required by the learning platform without adding progress, search, ingestion, or UI features in this slice.

## Skills read
- `sanity-best-practices`: schema definitions, validation, GROQ projections, references, private clients, and Next.js integration.
- `content-modeling-best-practices`: reusable documents versus embedded course modules and separation of content from presentation.
- `portable-text-serialization`: Portable Text shape and query/rendering expectations.
- Project `AGENTS.md`: Vertex's fixed content model, server/client boundaries, prompt approval workflow, and checks.
- Next.js 16 local guidance under `node_modules/next/dist/docs/`: App Router and server module conventions.

## Code inspected
- `package.json`: Next.js 16.3.2, `next-sanity`, Sanity 5, `@sanity/image-url`, and no dedicated data-query/typegen scripts.
- `sanity.config.ts`: current Studio configuration mounted at `/studio`, using the existing schema and structure exports.
- `sanity/schemaTypes/index.ts`: empty schema registry.
- `sanity/env.ts`: existing project, dataset, and dated API-version environment configuration.
- `sanity/lib/client.ts`: existing CDN-backed `next-sanity` client without a read token or fetch helper.
- `sanity/structure.ts`: default document list structure.
- `app/studio/[[...tool]]/page.tsx`: existing embedded Studio route that consumes the root config.
- `app/layout.tsx` and `app/page.tsx`: current Next.js shell and presentational landing page; no Sanity data consumers yet.

## Decisions and assumptions
- Keep the current repository's existing Studio mounting arrangement in this focused change so the existing `/studio` route remains functional; do not introduce a second backend or redesign application routes.
- Use Sanity documents for `course`, `lesson`, `instructor`, and `category`. Model `module` as an embedded object inside `course`, with lesson references preserving editorial order.
- Use `defineType`, `defineField`, and `defineArrayMember` throughout. Add direct `@sanity/icons` usage only if the package is already a supported direct dependency; otherwise add it through the package manager rather than relying on a transitive install.
- Use references for instructors, categories, and lessons because they are reusable and independently editable. Do not add a parent-course field to lessons; course lookup must use reverse references.
- Use Portable Text for lesson notes, with link annotations and standard block styles only in this slice. Do not store markdown.
- Keep video URLs as URL fields. This task does not add video documents, transcripts, chapter ingestion, or provider playback.
- Keep the read client server-only by placing the token-based client and fetch helper under `sanity/lib` and marking the module with `server-only`. The browser must never receive `SANITY_API_READ_TOKEN`.
- Preserve the existing CDN client export for compatibility, but make the server data layer use the private token client and explicit projections. Use `defineQuery` for GROQ queries.
- Keep queries focused on content consumers: course catalog, course by slug, lesson by slug with its reverse-referenced course/module context, instructor by slug, and category listing/by slug. Return only required fields and expand image asset URLs/metadata and references as needed.
- Use a shared query projection for course/lesson relationships where practical, while retaining readable typed result interfaces. Do not invent generated types if TypeGen is not configured; add a minimal type-generation script/config only if it fits the existing Sanity version and can be verified locally.
- Add validation for required titles/slugs, URL schemes, positive numeric durations/student counts/prices where applicable, non-empty ordered arrays where the platform requires them, and resource URL schemes. Avoid validation that prevents legitimate drafts from being authored.

## Required implementation
1. Expand `sanity/schemaTypes/index.ts` to register all schema definitions.
2. Add schema definitions and any small shared object definitions for:
   - `course`: title, slug, summary, cover image, level, price, optional popular flag, student count, learning outcomes (`icon`, `title`, `description`), instructor reference, category reference, and ordered embedded modules.
   - embedded `module`: title, summary, ordered lesson references.
   - `lesson`: title, slug, video URL, poster/thumbnail image, duration, free preview flag, student count, Portable Text notes, key points, optional pro tip, and resources (`type`, `title`, `description`, `url`). Do not include a course reference.
   - `instructor`: name, slug, photo, expertise, bio.
   - `category`: title, slug, description.
3. Configure useful Studio previews and structure labels without changing the application's visual UI. Ensure module/lesson ordering is represented by array order, not stored numbers.
4. Add server-only Sanity data access under `sanity/lib`:
   - a private read client using `SANITY_API_READ_TOKEN`, `useCdn: true`, and the existing project/dataset/API version values;
   - a typed `sanityFetch` wrapper with Next.js cache/revalidation options and safe defaults;
   - query definitions and data functions for the catalog, individual course, individual lesson, instructor, and category reads.
5. Ensure the lesson query derives its course and module context from reverse references and preserves the ordered lesson index needed by later page work.
6. Update environment documentation only if an existing `.env.example` or equivalent is present; do not read or commit secret values. If no canonical env example exists, add only the public Sanity variables and the name `SANITY_API_READ_TOKEN`, never its value.
7. Keep the current Studio route/config working and avoid changing unrelated Clerk, landing-page, analytics, search, progress, or ingestion code.

## Security considerations
- `SANITY_API_READ_TOKEN` is server-only and must not use a `NEXT_PUBLIC_` prefix or be imported by client components.
- Do not log tokens, environment values, full documents, or whole Portable Text/transcript-like payloads.
- Use parameterized GROQ values; never interpolate user-provided slugs into query strings.
- Return explicit projections rather than entire Sanity documents.
- Do not add write access or a write client in this read-only slice.

## Acceptance criteria
- Studio recognizes and presents course, lesson, instructor, and category documents, with modules as embedded course objects.
- All required relationships and field shapes from `AGENTS.md` are represented and validated.
- Lesson notes use Portable Text and resources/key points are structured arrays.
- Course, lesson, instructor, and category GROQ queries use `defineQuery`, explicit projections, and parameterized slugs.
- Lesson data includes reverse-resolved course/module context without storing a parent-course field on lessons.
- The private read client cannot be bundled into browser code and uses the server token only.
- Existing `/studio` and `/` routes remain intact.
- No unrelated product behavior is added.
- Type checking, lint, and production build pass.

## Checks to run
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Start with `npm run dev` and verify `/studio` loads, the Studio can create/edit each document type, and the existing home page still loads.
- If Sanity CLI commands are available and credentials/project configuration permit it, run schema/type validation without printing secrets.

## Manual test steps
1. Run `npm run dev` from the repository root.
2. Open `/studio` and confirm the document list contains Course, Lesson, Instructor, and Category.
3. Create an instructor and category, then create several lessons with notes, key points, resources, and video URLs.
4. Create a course, select the instructor/category, add modules, and add the lessons in a deliberate order.
5. Confirm the Studio displays module and lesson order without requiring manually entered module or lesson numbers.
6. Confirm saving a draft with missing required title/slug fields is rejected, while optional fields remain optional.
7. Use the Studio Vision tool or a server-side caller to verify the course and lesson queries return only projected fields and that a lesson resolves its course/module context through reverse references.
8. Confirm the browser bundle and browser devtools never expose `SANITY_API_READ_TOKEN`.
9. Confirm the existing home page and Clerk routes remain unchanged and functional.

## Expected files
- `sanity/schemaTypes/index.ts`
- `sanity/schemaTypes/objects/*` for embedded module, learning outcome, and resource definitions as appropriate
- `sanity/schemaTypes/documents/course.ts`
- `sanity/schemaTypes/documents/lesson.ts`
- `sanity/schemaTypes/documents/instructor.ts`
- `sanity/schemaTypes/documents/category.ts`
- `sanity/lib/client.ts` (server-only read client/fetch helper, preserving compatible exports)
- `sanity/queries/*.ts` or an equivalent focused query module
- `sanity.types.ts` and/or Sanity typegen config only if justified by the existing setup
- `.env.example` only if needed for the canonical public/private variable names
- `package.json` and `package-lock.json` only if a required direct dependency or verification script is added
- `prompts/sanity-content-model-and-data-layer.md`
