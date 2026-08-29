# Seed Sanity from Provided Fixtures

## Goal
Seed the configured Sanity project and dataset using the provided fixture files, without generating replacement content or modifying either fixture.

## Skills and files inspected
- `sanity-migration` and `sanity-best-practices`
- `sanity.cli.ts` and `sanity.config.ts` for the configured Sanity project/dataset
- `sanity/schemaTypes/index.ts` for the registered document types
- `scripts/seed.ndjson`: 141 documents — 6 categories, 5 instructors, 120 lessons, and 10 courses
- `scripts/videos.json`: 120 video metadata records keyed by lesson slug

## Execution plan
1. Run the Sanity CLI bulk import:
   `npx sanity datasets import scripts/seed.ndjson --replace`
2. Verify document counts with authenticated Sanity CLI GROQ queries.
3. Verify that all 120 `videos.json` keys map to seeded lessons and their video URLs.
4. Verify course/module lesson references resolve and report any relation issues.
5. Confirm neither fixture file was modified.

`videos.json` is ordinary metadata JSON rather than Sanity NDJSON; it will be used for read-only validation and will not be passed directly to the importer. No video documents or other generated content will be created.

## Security and safety
- Do not print or expose environment variables or Sanity tokens.
- Do not delete unrelated dataset content.
- Do not modify `scripts/seed.ndjson` or `scripts/videos.json`.

## Acceptance criteria
- Sanity CLI import completes successfully.
- Actual post-import counts are reported by document type and total.
- The 120 video metadata records match the 120 seeded lessons.
- All course/module lesson references resolve.
- Both fixture files remain unchanged.

## Manual checks
- Open the Studio and confirm seeded courses, lessons, instructors, and categories are visible.
- Open a course and verify its module lesson order.
- Open a lesson and verify its video URL and notes.
