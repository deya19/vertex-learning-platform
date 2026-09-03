# Search video results must start playback at the matched minute

## Goal

When a learner searches and clicks a video result, the lesson page's embed must start at the
matched second, not at 0:00. The plumbing for this already exists end to end; the feature fails
today because video moments are often missing from search responses. This prompt closes the
reliability gap in the search route and hardens the player's start handling.

## Skills read

- AGENTS.md (sections 7, 9, 11, 12: two-stage timestamp resolution, provider embeds, grounding rules)
- No external skill needed; this is a server route + client player change following existing patterns.

## Code inspected

- `app/api/search/route.ts` — LLM path (`runAgentSearch`) + keyword fallback (`runFallbackSearch`)
  both produce `SearchCandidate`s; `shapeResults` builds `href` as
  `/lessons/<slug>?start=<seconds>&source=search` for video candidates (line 383). The fallback
  already matches chapters first, then chunks, per video URL.
- `app/lessons/[slug]/page.tsx` — parses `?start=` and `?source=search` into `startSeconds` /
  `startSource` (lines 57-60) and passes them to `LessonPlayer`.
- `app/lessons/[slug]/lesson-player.tsx` — sets `start` on the YouTube iframe src (line 210) and
  creates the player with `new window.YT.Player(iframe, ...)` without `playerVars`.
- `app/search/search-results.tsx` — video cards already render "Watch from <label>" and link to
  `result.href`. No change needed.
- Live data check (2026-09-03):
  - 16 of 120 manifest videos were ingested into `video` documents (104 failed yt-dlp caption
    acquisition — the seed data references placeholder YouTube IDs). Lessons without a video
    document can never produce a grounded timestamp; that is correct behavior, not a bug.
  - For an ingested video (`cGiSr0MilsI`, "Core Web Vitals in a React app", chapters LCP@70s,
    CLS@342s, INP@611s), a live search for "core web vitals" returned only a lesson result —
    the LLM path succeeded, so the fallback (which does the video lookup) never ran.

## Root causes

1. The LLM path trusts the model to return video results with `matchedSeconds`. gpt-4o-mini often
   returns lesson results only, and since `shapeResults` is non-empty the deterministic fallback
   never runs. Video moments are then silently dropped even when video documents exist.
2. The player relies solely on the `start` query param surviving the YouTube IFrame API takeover
   of the existing iframe. The documented way to guarantee the start position is `playerVars.start`.

## Decisions and assumptions

- Add a deterministic, server-side video-moment enrichment step in the search route instead of
  prompt-tuning the model. This matches AGENTS.md section 7: chapters first, transcript fallback,
  grounded in real data, video docs stay an internal lookup.
- Enrichment runs for the LLM path only when it under-delivers (no video candidates), and always
  as the fallback path's existing behavior is kept. Lesson candidates from either path get a
  video-moment lookup for their `videoUrl`.
- Do not fabricate timestamps for the 104 un-ingested videos. Those lessons show lesson results
  only until real captions/chapters are ingested (user decision, see Needs your attention).
- Keep the `matchedSeconds <= lesson.duration` guard in `shapeResults` as-is.

## Files to touch

- `app/api/search/route.ts` — add `enrichVideoMoments()` and wire it into the POST handler.
- `app/lessons/[slug]/lesson-player.tsx` — pass `playerVars` (including `start`) to `YT.Player`.

## Requirements

### 1. Deterministic video-moment enrichment (`app/api/search/route.ts`)

- New async helper `enrichVideoMoments(candidates, lessonsBySlug, query, signal)`:
  - Collect the distinct `videoUrl`s of lesson candidates (kind `lesson`) that do not already have
    a video candidate for the same lesson, capped at 10 URLs, using `lessonsBySlug` for lookups.
  - If none, return the input unchanged.
  - One GROQ query over `*[_type == "video" && url in $urls]` projecting, per video:
    `"chapter": chapters[<token conditions on label>][0] {startSeconds, label}`,
    `"chunk": chunks[<token conditions on text>][0] {startSeconds, text}` — reusing
    `tokenizeQuery`, `buildTokenParams`, and `tokenConditions` exactly like `runFallbackSearch`.
  - For each lesson candidate whose video doc has a chapter or chunk match, push a video candidate
    `{kind: 'video', lessonSlug, courseSlug, matchedSeconds, matchedLabel}` (label from the
    chapter, else the first 60 chars of the chunk text), mirroring the fallback's shape. Keep the
    existing lesson candidate so the lesson card still appears alongside the video card.
  - Dedupe: never add a second video candidate for a lesson that already has one.
- Wire-in in `POST`:
  - LLM path: after building `candidates` from `output.results`, if no candidate has
    `kind: 'video'`, call `enrichVideoMoments` before the `SEARCH_RESULT_LOOKUP_QUERY` fetch
    (it needs `lessonsBySlug`, so run it after that fetch, before the `shapeResults` empty check).
  - Fallback path: unchanged — `runFallbackSearch` already does this work.
- Keep every GROQ response small: project only the two matched entries, never arrays.

### 2. Player start hardening (`app/lessons/[slug]/lesson-player.tsx`)

- In the `YT.Player` options add `playerVars: { rel: 0, modestbranding: 1, ...(startSeconds > 0 ?
  { start: Math.floor(startSeconds) } : {}) }` so the API applies the start position itself.
- Keep the existing iframe `src` params (they remain the no-API fallback and are harmless).

## Security considerations

- No new env vars, tokens, or routes. The Sanity read token stays server only; the enrichment
  query runs inside the existing server route. The response shape is unchanged and validated by
  the existing Zod schemas. No client-side secrets introduced.

## Acceptance criteria

- `POST /api/search` with a query matching an ingested video's chapter or transcript returns at
  least one `kind: "video"` result with non-null `matchedSeconds`/`matchedLabel` and an `href`
  containing `start=<seconds>&source=search`.
- Queries that match nothing video-related return lesson results only (no invented timestamps).
- Response shape and status codes unchanged; rate limiting untouched.
- Type check, lint, and production build pass in the web workspace.

## Checks to run

1. `npx tsc --noEmit` (web workspace type check).
2. `npm run lint` (web workspace).
3. `npm run build` (server route changed, so a production build is required).
4. Live verification against the dev server with curl (below).

## Manual test steps

1. Start `npm run dev` and open `http://localhost:3000/search`.
2. Search `largest contentful paint`. Expect a VIDEO card ("Watch from LCP") above/with the
   lesson card for "Core Web Vitals in a React app".
3. Click the video card. Expect the lesson page URL to contain `?start=70&source=search` and the
   YouTube embed to begin at 1:10, not 0:00.
4. Search `caching`. Expect lesson results; any video card present must start at its labeled
   second when clicked.
5. Search a nonsense string (`zzqq brute force`). Expect no video cards and no invented
   timestamps.

## Needs your attention (out of scope)

- 104 of 120 videos have no ingested captions/chapters because the seed data references
  placeholder YouTube IDs that yt-dlp cannot fetch. Those lessons can only ever show lesson
  results. Fixing that requires real video URLs (or authored transcripts/chapters in the
  manifest) and a re-run of `fetch-video-sources` + `npm run ingest:videos -- --write`.
