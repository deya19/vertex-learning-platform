---
title: Implement offline video transcript and chapter ingestion
---

## Goal
Build a repeatable, offline ingestion pipeline that converts provider video metadata plus local caption/chapter source files into Sanity `video` documents. Each document must contain a stable URL-derived identifier, the canonical video URL, clean chapter markers, and short timestamped transcript chunks. The pipeline must produce importable NDJSON and optionally write to Sanity only when explicitly requested; it must never run in a web request path or expose Sanity credentials.

## Skills consulted
- `sanity-best-practices`: Sanity v5 schema definitions, explicit array members, document modeling, deterministic import considerations, and server-only credentials.
- `content-modeling-best-practices`: keep reusable video intelligence as its own document and keep transcript/chapter data structured rather than flattened text.
- `sanity-migration`: repeatable offline extraction/transformation, NDJSON output, validation, reruns, and quality reporting. This is not a CMS migration, so the full source-system migration artifacts are not needed.

## Code and configuration inspected
- `AGENTS.md` sections 5, 8, 9, 11, 12, and 13 — requires a dedicated `video` document, `{startSeconds, label}` chapters, `{startSeconds, text}` transcript chunks, URL-derived IDs, chapter-first matching, no whole transcripts in request results, and offline-only ingestion.
- `sanity/schemaTypes/documents/lesson.ts` — lessons currently store the provider URL in `videoUrl` and do not reference a video document.
- `sanity/schemaTypes/index.ts` — document and object schema registration point.
- `sanity/queries.ts` and `app/api/search/route.ts` — search already expects video documents keyed by matching `videoUrl`; video documents remain internal lookup data.
- `sanity/lib/client.ts` — existing server-only Sanity client pattern; the pipeline must use a separate write-capable client only in the offline script.
- `sanity.cli.ts` and `sanity/env.ts` — configured project, dataset, and API version.
- `scripts/videos.json` — existing 120-entry video manifest keyed by lesson slug, currently containing YouTube metadata and URLs derived from the video IDs.
- `scripts/seed.ndjson` — seeded lesson documents and current video URLs; it contains no transcript or chapter documents.
- `app/lessons/[slug]/lesson-player.tsx` — current playback implementation supports YouTube only; this task does not silently claim Vimeo/Bunny playback support or change the request-path architecture.
- `package.json` and `tsconfig.json` — TypeScript project with strict checking, no existing first-party ingestion command, and no direct caption-fetch dependency.

## Decisions and assumptions
1. The pipeline is intentionally offline and source-driven. It reads local caption and chapter files supplied by the operator rather than scraping provider pages or calling undocumented provider APIs.
2. The existing `scripts/videos.json` remains unchanged. Its keys are used to locate sidecars under a configurable source directory, for example `scripts/video-sources/<manifest-key>.vtt` and `scripts/video-sources/<manifest-key>.chapters.json`.
3. The source contract supports WebVTT, SRT, and a documented JSON caption shape (`[{startSeconds, durationSeconds?, text}]` or `[{start, end?, text}]`) plus chapter JSON (`[{startSeconds, label}]`, with `start` accepted as a timestamp string). This keeps provider-specific acquisition outside the pipeline while allowing YouTube, Vimeo, and Bunny URLs to be validated and normalized consistently.
4. Provider detection must recognize YouTube (`youtube.com`, `youtu.be`), Vimeo (`vimeo.com`, `player.vimeo.com`), and Bunny Stream hostnames/URLs. Unsupported providers fail validation with an actionable error.
5. The Sanity document `_id` is derived from the canonical video URL by prefixing a safe type name and stripping/replacing characters that Sanity rejects. The same URL must always converge to the same document on rerun. The URL remains stored in `url` for lookup and auditability.
6. Transcript cues are normalized, sorted, deduplicated, whitespace-normalized, and merged into bounded chunks so the output has many short timestamped pieces rather than one whole-transcript field. Chunk boundaries must preserve cue start times and avoid merging across a chapter boundary when practical.
7. Chapters are normalized, sorted, deduplicated, validated to be non-negative, and retained as clean labels. Chapter timestamps are preferred source data; transcript chunks are the fallback source for search.
8. The default command only writes NDJSON and a validation report. A separate explicit flag such as `--write` may create or replace Sanity documents using `SANITY_API_WRITE_TOKEN`; no token is printed, and missing credentials fail before any write.
9. Missing or malformed sidecars are reported per manifest entry and cause a non-zero exit for the batch, with no partial Sanity writes in default mode. The pipeline must not fabricate captions or chapter labels from titles, duration, or the web.
10. Tests should exercise pure parsing/normalization and document generation without network access or Sanity credentials. A small temporary fixture can be created inside the test command or committed only if it matches existing repository conventions; do not modify the 120-entry manifest or seed fixture.

## Expected files to touch
- `sanity/schemaTypes/documents/video.ts` — new `video` document schema with `url`, `chapters`, and `chunks` fields and validation.
- `sanity/schemaTypes/index.ts` — register the new document type.
- `scripts/ingest-videos.ts` — CLI, provider detection, source loading, VTT/SRT/JSON parsing, normalization, deterministic document creation, NDJSON output, validation report, and optional Sanity write.
- `scripts/video-ingestion.ts` or another small adjacent module if separating pure parsing from CLI improves testability; keep it under `scripts/` and avoid importing application/server modules.
- `package.json` — add the smallest script/dependency changes needed to run the typed offline command and tests; do not add a caption scraping dependency.
- A focused test file adjacent to the script only if the repository’s available test tooling supports it; otherwise expose pure functions and verify them through a no-network fixture command.
- Do not modify `scripts/videos.json`, `scripts/seed.ndjson`, lesson queries, search behavior, or the browser player unless a type/schema registration change requires it.

## Requirements
### Sanity model
- Define the document with `defineType`, every field with `defineField`, and every array item with `defineArrayMember`.
- Use document type `video`, a clear Studio title/icon if the installed icon package supports it, and fields:
  - `url`: required URL limited to `http`/`https`.
  - `chapters`: array of objects containing required non-negative integer `startSeconds` and required non-empty `label`.
  - `chunks`: array of objects containing required non-negative integer `startSeconds` and required non-empty `text`.
- Keep transcript chunks and chapter markers as structured arrays; do not add a whole-transcript field.
- Register the schema in `sanity/schemaTypes/index.ts`.

### Input and provider handling
- Accept a manifest path, source directory, and output path through CLI flags with sensible defaults based on `scripts/videos.json`.
- Accept an optional per-entry source override in the manifest without breaking the current manifest shape.
- Resolve captions and chapters from deterministic sidecar names and document the supported naming/JSON shapes in the script’s CLI help or existing project documentation/comments only where needed.
- Canonicalize URLs for identity without removing meaningful provider IDs or query parameters needed to identify the video.
- Validate all three providers and reject unsupported/malformed URLs before transforming.

### Parsing and transformation
- Parse VTT and SRT timestamps including hour, minute, second, and millisecond formats.
- Parse JSON sources with strict runtime validation and useful entry-level errors.
- Strip caption markup/entities conservatively, normalize whitespace, discard empty cues, and preserve meaningful punctuation.
- Sort cues by timestamp, remove exact duplicate cues, and merge adjacent cues into bounded chunks using a clear deterministic rule (for example a maximum character count and/or short time window).
- Normalize chapters similarly, reject labels that are empty, and ensure timestamps do not exceed an optional manifest duration unless the source is otherwise valid; report warnings for non-fatal duration mismatches.
- Generate a Sanity document with `_id`, `_type: 'video'`, `url`, `chapters`, and `chunks` only when those values are valid.
- Produce stable `_key` values for generated array members so repeated output is diff-friendly.

### Output and writes
- Emit valid one-document-per-line NDJSON suitable for `sanity datasets import`.
- Emit a machine-readable or human-readable validation summary with counts for processed, emitted, skipped, warnings, missing sources, and malformed sources.
- Default mode must not mutate Sanity.
- Explicit write mode must use a server-side write token, `createOrReplace`/equivalent idempotent mutations, bounded batches, and no logging of token values.
- Never fetch provider pages, call external caption services, or run inside Next.js route handlers.

## Security considerations
- Keep `SANITY_API_WRITE_TOKEN` and all project configuration in environment variables; never write them to output or logs.
- Do not add browser-side access to the write client.
- Treat local transcript files as untrusted input: validate JSON, bound chunk sizes, reject invalid timestamps, and avoid unsafe command execution or dynamic imports based on file contents.
- Do not silently overwrite Sanity data except under the explicit operator-selected write mode, and make reruns deterministic.
- Do not change dataset privacy, auth, or security policies to make ingestion work.

## Acceptance criteria
1. `video` is registered in the Studio schema and validates the required URL, chapter, and chunk structure.
2. A no-network fixture run parses VTT, SRT, and supported JSON captions plus chapter JSON into normalized timestamped arrays.
3. Generated documents have stable URL-derived `_id` values and stable array keys across repeated runs.
4. The current `scripts/videos.json` and `scripts/seed.ndjson` remain byte-for-byte unchanged.
5. Missing and malformed sidecars produce actionable validation output and a non-zero exit without a partial write.
6. The default command creates valid NDJSON only and does not require or expose a Sanity write token.
7. Explicit write mode is idempotent, token-safe, and uses the configured Sanity project/dataset.
8. The pipeline validates YouTube, Vimeo, and Bunny URLs and rejects unsupported providers.
9. No Next.js request path, browser bundle, or search response contains a whole transcript or unrestricted chunks array.
10. Type checking, linting, and the relevant schema/build checks pass.

## Checks to run after approval
- `npx tsc --noEmit`
- `npm run lint`
- Run the ingestion CLI against a temporary no-network fixture and inspect the generated NDJSON/report.
- Run the CLI in validation/output mode against the existing manifest without modifying either fixture; report missing sidecars honestly if the repository does not contain source files for all entries.
- Run `npm run build` because the Sanity schema is part of the application build.
- If credentials and a deployed dataset are available, run the explicit write mode for a small fixture batch, then query only document counts and representative chapter/chunk shapes without printing secrets.

## Manual test steps
1. Create a temporary fixture directory containing one WebVTT caption file, one SRT caption file, one JSON caption file, and chapter JSON for representative YouTube, Vimeo, and Bunny URLs.
2. Run the documented no-write ingestion command with that fixture manifest and an output path.
3. Confirm the command reports the processed/emitted counts and writes one valid NDJSON document per input video.
4. Inspect one output document: verify the URL-derived `_id`, provider URL, sorted chapter timestamps, short transcript chunks, and stable `_key` values.
5. Run the same command again and compare outputs; they must be identical.
6. Remove one sidecar and corrupt another, rerun, and confirm clear per-entry errors, a non-zero exit, and no Sanity mutation.
7. If using a configured Sanity dataset, run the explicit write mode for the fixture and verify the `video` documents in Studio or Vision; rerun it and confirm document counts do not double.
8. Confirm the lesson/search application still builds and that no browser request is used to ingest transcripts.
