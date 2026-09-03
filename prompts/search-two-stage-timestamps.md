# Search: grounded two-stage timestamp resolution + on-site timestamped playback

## Goal

A video search result must carry a timestamp that is provably grounded in the video's own
chapters or transcript (chapters first, transcript fallback), deep link to the lesson page at
that second, and the embedded YouTube player must start there. Today the plumbing exists but the
resolution logic is split across three inconsistent code paths and one path trusts invented
timestamps.

## Skills read

- AGENTS.md sections 7, 9, 11, 12 (two-stage resolution, provider embeds, grounding, context-window rules).
- No external skill needed: server route + client player change following existing patterns.

## Code inspected

- `app/api/search/route.ts` — three resolution paths exist:
  1. LLM path: trusts model-returned `matchedSeconds`/`matchedLabel` verbatim (only a
     `<= lesson.duration` check in `shapeResults`, line 485).
  2. `enrichVideoMoments` (line 368) and `findVideoMomentResults` (line 410): fetch up to 4
     filtered chapters + chunks per video and pick via `pickBestMoment` (line 355) — chapters
     ranked by token hits first, transcript fallback. Correct two-stage logic.
  3. `runFallbackSearch` (line 294): projects only `chapters[...][0]` / `chunks[...][0]` — the
     FIRST match in document order, not the best token match, and does not reuse
     `pickBestMoment`.
- `app/lessons/[slug]/page.tsx` — parses `?start=` / `?source=search` into `startSeconds` /
  `startSource` (lines 57-60), passes to `LessonPlayer`. Fine as-is.
- `app/lessons/[slug]/lesson-player.tsx` — iframe src includes `start` param (line 218) and
  `YT.Player` gets `playerVars.start` (line 157). But when the IFrame API takes over the existing
  iframe, `playerVars` are not guaranteed to be re-applied; there is no explicit `seekTo`.
- `app/search/search-results.tsx` — video cards already link `result.href` with
  "Watch from <label>" (line 100). No change needed.
- `sanity/schemaTypes/documents/video.ts` — `chapters {startSeconds, label}`,
  `chunks {startSeconds, text}`. Matches the plan.

## Defects in the current implementation

1. **Invented timestamps can reach the UI.** The LLM path keeps model-provided
   `matchedSeconds`/`matchedLabel` as long as they are `<= lesson.duration`. That violates the
   grounding rule (never invent a timestamp).
2. **One invented video result suppresses deterministic resolution.** `enrichVideoMoments` and
   `findVideoMomentResults` only run when the model returned ZERO video candidates.
3. **Fallback path picks the wrong moment.** `chapters[...][0]` is document order, not best
   token match; inconsistent with `pickBestMoment` used by the other two paths.
4. **Player start is not guaranteed** after the IFrame API takeover; no explicit `seekTo`.

## Decisions and assumptions

- Rework the existing (uncommitted) implementation in place. Do NOT revert other uncommitted
  changes in the tree (HeaderAuth, proxy.ts, etc. — unrelated work).
- One shared fetch + one shared picker for all three paths: `resolveVideoMoments(urls, tokens)`
  (one GROQ query, ≤4 filtered chapters + ≤4 filtered chunks per video, never whole arrays) and
  the existing `pickBestMoment` as the ONLY selection point.
- Model-returned video moments are never trusted: re-resolve every video candidate against the
  video document. Grounded match replaces the model's seconds/label; no match downgrades the
  candidate to a lesson result. This guarantees no invented timestamp can ship.
- Enrichment runs for every lesson candidate lacking a video candidate (not only when zero video
  candidates exist). `findVideoMomentResults` stays as the video-docs-first sweep for queries
  that only live in chapter labels/transcript.
- Player: keep the iframe `start` param and `playerVars.start`, and add an explicit
  `seekTo(startSeconds, true)` in `onReady` when `startSeconds > 0` — deterministic regardless of
  how the API treats the pre-existing iframe.
- `shapeResults` duration guard: skip the check when `lesson.duration` is 0/unknown instead of
  silently dropping every video result.
- Only YouTube playback exists today; Vimeo/Bunny embeds are out of scope (AGENTS.md section 9:
  a provider is supported only when ingestion AND playback exist).

## Files to touch

- `app/api/search/route.ts` — add `resolveVideoMoments()`; rework LLM-path video verification,
  `enrichVideoMoments`, `runFallbackSearch`, and the `shapeResults` duration guard.
- `app/lessons/[slug]/lesson-player.tsx` — add `seekTo` to the player type and call it in
  `onReady`.

## Requirements

### 1. Shared resolver (`app/api/search/route.ts`)

- `async function resolveVideoMoments(videoUrls: string[], tokens: string[], signal?)` returning
  `Map<url, VideoMomentDoc>`: one GROQ query `*[_type == "video" && url in $urls]` projecting
  `"chapters": chapters[<tokenConditions on label>][0...4] {startSeconds, label}` and
  `"chunks": chunks[<tokenConditions on text>][0...4] {startSeconds, text}`. Reuse
  `tokenizeQuery`, `buildTokenParams`, `tokenConditions`. Never project unfiltered arrays.
- `pickBestMoment` stays the only moment picker (chapters ranked by token hits, then earliest
  second on ties; transcript only when no chapter matched).

### 2. LLM path: verify, never trust

- After the `SEARCH_RESULT_LOOKUP_QUERY` fetch builds `lessonsBySlug`:
  - Collect distinct video URLs of candidates with `kind: 'video'` (cap 10) plus lesson
    candidates lacking a video candidate (cap 10 total), resolve them in ONE
    `resolveVideoMoments` call.
  - For each model video candidate: if `pickBestMoment` returns a match, REPLACE
    `matchedSeconds`/`matchedLabel` with the grounded values; if not, convert the candidate to
    `kind: 'lesson'`.
  - For each lesson candidate without a video candidate: if its lesson's video resolves, insert
    a video candidate before it (current `enrichVideoMoments` behavior, now always run).
  - Keep the existing `findVideoMomentResults` merge for queries with no lesson-field footprint,
    and the `runFallbackSearch` merge when still no video candidate exists.

### 3. Fallback path: same picker

- `runFallbackSearch` switches to `resolveVideoMoments` + `pickBestMoment` (drop the
  `chapters[...][0]` projection). Behavior otherwise unchanged.

### 4. Duration guard

- In `shapeResults`, apply `matchedSeconds <= lesson.duration` only when `lesson.duration > 0`.

### 5. Player seek hardening (`app/lessons/[slug]/lesson-player.tsx`)

- Add `seekTo: (seconds: number, allowSeekAhead: boolean) => void` to the `YouTubePlayer` type.
- In `onReady`, when `startSeconds > 0`, call `player.seekTo(Math.floor(startSeconds), true)`.

## Security considerations

- No new env vars, routes, or tokens. All video-doc queries stay in the server route with the
  server-only Sanity read token. GROQ responses stay small (filtered, capped projections), and
  the existing MCP response cap and Zod validation are untouched. No client-side secrets.

## Acceptance criteria

- A query matching an ingested video's chapter returns a video result whose `matchedSeconds`/
  `matchedLabel` come from the video document, with `href` containing
  `start=<seconds>&source=search`.
- A query matching only transcript text (no chapter) returns a video result whose seconds come
  from the matched chunk.
- A model response containing an invented timestamp cannot reach the UI: the seconds/label are
  replaced by grounded values or the card downgrades to a lesson result.
- Queries matching nothing video-related return lesson results only.
- Clicking a video card loads the lesson page and the embed starts at the matched second.
- Type check, lint, and production build pass in the web workspace.

## Checks to run

1. `npx tsc --noEmit` (web workspace).
2. `npm run lint` (web workspace).
3. `npm run build` (server route changed).
4. Live verification against the dev server (steps below).

## Manual test steps

1. `npm run dev`, open `http://localhost:3000/search`.
2. Search `largest contentful paint`. Expect a VIDEO card "Watch from LCP" for "Core Web Vitals
   in a React app" with a lesson card alongside.
3. Click the video card. Expect the lesson URL to contain `?start=70&source=search` and the
   YouTube embed to begin at 1:10.
4. Search a transcript-only term (a word that appears in a chunk but no chapter label). Expect a
   video card whose start second matches the chunk, not 0:00.
5. Search `zzqq brute force`. Expect no video cards and no invented timestamps.
