---
title: Acquire YouTube captions and populate video intelligence
---

## Goal
Acquire available English captions and chapter metadata for the 120 YouTube videos already listed in `scripts/videos.json`, normalize them into the sidecar contract used by the offline ingestion pipeline, write every valid resulting `video` document to Sanity, and report videos that cannot be processed without fabricating content.

## Skills consulted
- `sanity-best-practices`: preserve the dedicated structured `video` model and keep credentials server/offline only.
- `sanity-migration`: make acquisition repeatable, idempotent, validated, and report source failures instead of silently dropping records.
- `content-modeling-best-practices`: retain chapters and transcript chunks as semantic structured data.

## Code and environment inspected
- `scripts/videos.json`: 120 entries, all with IDs; all 120 IDs are unique.
- `scripts/ingest-videos.ts`: accepts local VTT/SRT/JSON captions and chapter JSON, emits deterministic NDJSON, and supports explicit idempotent Sanity writes.
- `sanity/schemaTypes/documents/video.ts`: stores URL, chapters, and timestamped transcript chunks.
- Python 3.11.2 is installed.
- `yt-dlp` is not currently installed.
- Stable `yt-dlp` 2026.08.19 was published more than seven days ago and will be pinned instead of installing a floating/latest version.

## Decisions and assumptions
1. Use pinned `yt-dlp==2026.8.19` through Python to retrieve public YouTube metadata and English creator/automatic captions without downloading video media.
2. Do not use browser cookies, account credentials, proxy rotation, or anti-bot bypasses. Videos that require authentication, block automated access, lack captions, are private/deleted, or otherwise fail are recorded in a report and skipped.
3. Prefer creator-provided English captions; fall back to English automatic captions when necessary.
4. Extract chapter arrays from yt-dlp metadata. If a source has no chapters, write an explicit empty chapter sidecar so transcript fallback remains usable; do not invent chapter labels or timestamps.
5. Store generated source sidecars under `scripts/video-sources/`, keyed exactly like the existing manifest. Generated caption/metadata artifacts may be gitignored if large, while acquisition tooling and reports remain reproducible.
6. Add a small acquisition command that processes entries sequentially or with very low concurrency, supports resume/rerun, and avoids redownloading valid sidecars.
7. Run ingestion in validation mode first. Only after validation succeeds for the available subset, run explicit `--write` using the locally configured write token.
8. Existing three fixture documents remain separate examples. The production run creates URL-derived documents for successful manifest entries and does not delete unrelated documents.

## Expected files to touch
- `scripts/fetch-video-sources.ts` or `scripts/fetch-video-sources.py` — deterministic yt-dlp orchestration and metadata-to-chapters normalization.
- `scripts/ingest-videos.ts` — only if needed to support the acquired English subtitle filename convention or subset processing cleanly.
- `package.json` — add a source acquisition command if implemented in TypeScript; do not add an unneeded runtime dependency.
- `.gitignore` — ignore generated caption/metadata/output artifacts if they should not be committed.
- `scripts/video-sources/` and a generated acquisition report — local generated data, not hand-authored production code.
- Do not modify `scripts/videos.json` or `scripts/seed.ndjson`.

## Requirements
- Install `yt-dlp==2026.8.19` in the user Python environment or an isolated local environment without weakening package security controls.
- Process all 120 manifest entries and construct their canonical YouTube URLs.
- Download no video or audio media.
- Request English manual subtitles first and English automatic captions as fallback, in WebVTT format.
- Normalize the selected caption to `scripts/video-sources/<manifest-key>.vtt`.
- Normalize source chapters to `scripts/video-sources/<manifest-key>.chapters.json`, preserving only source labels and non-negative start seconds.
- Produce a report with total, successful, unavailable captions, unavailable videos, source errors, and chapter availability.
- Respect existing valid sidecars on reruns unless an explicit refresh option is selected.
- Run the existing ingestion pipeline against the acquired sources and write only valid documents.
- Verify final Sanity counts and representative chapter/chunk shapes without returning full transcripts.

## Security considerations
- Never print or persist Sanity token values.
- Do not read or export browser cookies.
- Do not attempt to bypass age gates, private-video access, authentication, geographic restrictions, or YouTube anti-bot controls.
- Treat downloaded metadata and captions as untrusted input and pass them through the existing validation and bounded chunking pipeline.
- Do not delete existing Sanity documents or unrelated source files.

## Acceptance criteria
1. Every manifest entry is attempted and represented in the acquisition report.
2. Every successful entry has a valid caption sidecar and chapter sidecar, with no fabricated text.
3. The ingestion command emits and writes one deterministic Sanity `video` document per successful unique URL.
4. Failed/unavailable videos are skipped with actionable reasons and do not block valid entries from being prepared; Sanity writes happen only after the valid subset is known.
5. No video/audio files, credentials, cookies, whole-transcript fields, or browser-side tokens are introduced.
6. Repeated acquisition and ingestion runs are idempotent.
7. Type checking, linting, production build, source validation, and Sanity count verification complete successfully.

## Checks to run
- Confirm the pinned yt-dlp version.
- Run the acquisition command across all 120 entries.
- Inspect the acquisition report and representative VTT/chapter sidecars.
- Run no-write ingestion and inspect emitted/skipped counts.
- Run explicit write mode with `.env.local` loaded without printing secrets.
- Query Sanity for video document count and only representative chapter/chunk counts.
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Manual test steps
1. Open the generated acquisition report and confirm all 120 manifest entries are accounted for.
2. Open representative sidecars and confirm caption timestamps/text and source chapter labels are present.
3. Refresh Sanity Studio and open **Video intelligence**.
4. Confirm successful production videos appear in addition to the three fixtures.
5. Open representative documents and verify chapters and short timestamped chunks.
6. Search for a topic from a successfully ingested transcript and confirm the result links to a stored timestamp.
