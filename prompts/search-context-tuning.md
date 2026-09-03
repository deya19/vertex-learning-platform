# Tune search: Context document (scope filter + instructions) and system prompt

## Goal

The search agent currently runs against the bare Context MCP base URL with no custom
instructions and no content scope, and its only guidance is the inline system prompt. This
prompt creates the `sanity.agentContext` document (scope filter + instructions), points the
app at it, and reshapes the inline system prompt so the two layers split cleanly per the
dial-your-context and shape-your-agent skills: data/query guidance in the Context document,
behavior and guardrails in the system prompt, with the critical query and ranking rules
duplicated in both (AGENTS.md section 11).

## Skills read

- `dial-your-context` (`.claude/skills/dial-your-context/SKILL.md`) — pure-delta instructions,
  groqFilter scoping, verify every claim with evidence.
- `shape-your-agent` (`.claude/skills/shape-your-agent/SKILL.md`) — system prompt structure
  (role / voice / boundaries / when you don't know), cut test, no overlap with Instructions.
- `create-agent-with-sanity-context` (`.agents/skills/.../SKILL.md`) — `sanity.agentContext`
  document shape (`slug`, `instructions`, `groqFilter`), document URL vs base URL, query-param
  overrides.

## Code inspected

- `sanity/lib/search-context.ts` — builds the MCP URL from `SANITY_CONTEXT_MCP_URL` /
  `SANITY_CONTEXT_SLUG`; today no slug is set, so the app uses the base URL and no Context
  document config applies. `/initial-context` is fetched and injected into the system prompt
  (5 min cache), so Context-document instructions reach the agent on the next request.
- `app/api/search/route.ts` — `SEARCH_SYSTEM_PROMPT` (lines 243-249) is the inline system
  prompt; `runAgentSearch` combines it with the MCP initial context; output is structured
  (`searchResponseSchema`), not chat.
- `sanity/schemaTypes/` — course (modules[].lessons[] refs), lesson (no parent course field),
  video (url, chapters, chunks). No `sanity.agentContext` type registered (plugin not
  installed — AGENTS.md section 12 says do not install it; create the document by import).
- Live dataset verification (2026-09-03, via the MCP `groq_query` tool):
  - 10 courses, 120 lessons, 19 video docs, 0 drafts, 0 `sanity.agentContext` docs.
  - Only 16 of 120 lessons have a matching `video` document → grounded timestamps exist only
    for those; the rest must return lesson results only.
  - Chapters exist on 8 of 19 videos; the rest have only transcript chunks. Chapter labels are
    clean ("Introduction to Next.js Routing"); chunk text is noisy transcript.
  - `lesson.description` and `lesson.overview` are empty on all 120 lessons; `keyPoints`,
    `notes`, `proTip` (34), `resources` (120) are populated. Course `summary` and
    `learningOutcomes` are populated on all 10.
  - Lesson notes end with boilerplate ("What this lesson covers … This lesson sits in
    <module>, part of <course> …") that repeats the keyPoints.
  - The MCP enforces the published perspective and auto-excludes `sanity.agentContext`, so no
    draft filtering is needed in instructions or filter.
  - The deployed Studio schema served by the MCP is stale: the compressed schema does not list
    the `video` type (added locally 9/1; Studio last deployed 8/31). `groq_query` still queries
    video docs fine, so instructions must teach the video shape until the Studio is redeployed.

## Decisions and assumptions

- **Document creation by import, not Studio.** The `@sanity/context` Studio plugin is not
  installed and AGENTS.md section 12 forbids installing it when it lags the Studio's Sanity
  major. `sanity.agentContext` documents of an unregistered type import fine and the MCP
  excludes the type from queries automatically.
- **Slug: `vertex-search`.** App switches to the document URL via `SANITY_CONTEXT_SLUG`.
- **Scope filter** limits the agent to the content types (AGENTS.md section 10):
  `_type in ["course", "lesson", "video", "instructor", "category"]`
- **Instructions are pure deltas** (schema-obvious facts excluded) plus the critical
  query/ranking rules AGENTS.md section 11 requires in both layers. Verified claims only.
- **System prompt keeps behavior + guardrails** (grounding, result kinds, response-size
  limits, refusal to invent) and drops nothing the route enforces server-side
  (`withResponseCap`, `groundVideoCandidates` stay as the enforcement backstop).
- **No code changes** to the search pipeline itself; this is config + prompt tuning only.
- **Studio redeploy is optional and user-gated** (it updates the deployed production Studio);
  instructions teach the video shape either way, so search works before and after.

## Files to touch

- `prompts/search-context-tuning.md` — this file.
- `scripts/agent-context.ndjson` (new, temp) — the `sanity.agentContext` document imported
  with `npx sanity dataset import`, then deleted.
- `.env.local` — add `SANITY_CONTEXT_SLUG="vertex-search"`.
- `app/api/search/route.ts` — rewrite `SEARCH_SYSTEM_PROMPT` only.
- `scripts/tmp-mcp-probe.mjs`, `scripts/tmp-queries.json`, `initial-context.txt` — temp
  verification artifacts created during investigation; deleted at the end.

## Requirements

### 1. Context document (imported via `npx sanity dataset import`)

```json
{
  "_id": "agentContext.vertex-search",
  "_type": "sanity.agentContext",
  "slug": {"_type": "slug", "current": "vertex-search"},
  "groqFilter": "_type in [\"course\", \"lesson\", \"video\", \"instructor\", \"category\"]"
}
```

`instructions` (plain text, ~25 lines, pure deltas + critical rules):

```markdown
### Schema gaps and traps

- `video` documents are missing from the compressed schema (stale Studio deploy). They exist:
  `_type == "video"` with `url`, `chapters[]{startSeconds, label}`, `chunks[]{startSeconds, text}`.
- A video moment is real only if a `video` document exists whose `url` equals the lesson's
  `videoUrl` (exact string match). Only 16 of 120 lessons have one — never invent a timestamp
  for a lesson without a video document.
- Chapters are the clean table of contents but exist on only some videos; when a video has no
  matching chapter, fall back to matching `chunks` text. Never return chunk text as a label
  when a chapter label exists.
- `lesson.description` and `lesson.overview` are empty for every lesson — match lessons on
  `title`, `keyPoints`, and `pt::text(notes)` only.
- Lesson notes end with boilerplate ("What this lesson covers … This lesson sits in <module>,
  part of <course> …") that repeats `keyPoints` — it is not unique content.

### Relationships

- Lessons store no parent course. Resolve the course with
  `*[_type == "course" && references(^._id)]` and read `modules[]{title, lessons[]}`.
- Labels like "Lesson 5.1 in Data Fetching and Caching" are derived from array positions:
  Module N is `modules[N-1]`, Lesson N.M is `modules[N-1].lessons[M-1]`. They are not stored.
- `video` documents are an internal lookup. Never return one as a result; always tie a moment
  to the lesson that plays that video.

### Query rules

- Wildcard each meaningful keyword and OR the terms; never match a whole phrase as one
  pattern. Use `pt::text(notes)` for notes text.
- Match chapters before chunks; project at most 5 filtered chapters/chunks per video; never
  project full `notes`, `chapters`, or `chunks` arrays.
- Return every relevant result ranked best first (exact title/concept matches first), with
  counts grounded in query results. If nothing matches, return zero results — do not pad.
```

### 2. `.env.local`

Add `SANITY_CONTEXT_SLUG="vertex-search"` so `createSearchContext()` uses
`.../context/mcp/<projectId>/<dataset>/vertex-search` and its `/initial-context` includes the
`## Custom instructions` section.

### 3. `SEARCH_SYSTEM_PROMPT` (behavior layer, ~250 words, shape-your-agent structure)

Keep the existing critical rules but reorganize:

- **Role**: Vertex's grounded course search agent over Sanity; searches via the Context MCP
  `groq_query` tool; returns only the requested structured output, never prose.
- **Behavior**: search both lesson topics and video moments; one comprehensive query preferred,
  at most two, then return; keep responses small (projections, slices, filtered
  chapters/chunks, max 5 per video; never whole transcripts or notes bodies).
- **Boundaries**: never return a `video` document as a result; never invent a course, lesson,
  price, duration, timestamp, or count; every value grounded in query results; no
  `semanticSimilarity()` unless the endpoint supports it.
- **When nothing matches**: return total 0, courseCount 0, empty results — no padding, no
  speculation.
- **Field mapping**: lesson results → video fields null, keyPoints from the lesson; video
  results → keyPoints empty, all video fields populated.

## Security considerations

- The write token (`SANITY_API_WRITE_TOKEN`) is used only by the one-off `sanity dataset
  import` CLI call; it never enters app code or the browser.
- The Context document is excluded from agent queries by the MCP itself; the groqFilter further
  scopes the agent to content types, so progress/app-state documents stay invisible.
- No secrets are added to any committed file; `.env.local` is gitignored.

## Acceptance criteria

- `*[_type == "sanity.agentContext"]` in the dataset returns exactly one published document
  with the slug, filter, and instructions above.
- `GET .../context/mcp/<projectId>/<dataset>/vertex-search/initial-context` returns a blob
  containing `## Custom instructions` with our content and the scoped schema.
- The app's search route uses the document URL (no code change needed beyond env) and the
  agent's system prompt contains the reshaped behavior prompt.
- `npm run lint` and `npx tsc --noEmit` pass (prompt-string change only).
- A live search for a chapter-only term (e.g. "file-based routing") still returns a video
  result grounded in a real chapter; a search for a topic with no video doc returns lesson
  results only, with no invented timestamps.

## Checks to run

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run build`

## Manual test steps

1. `npm run dev`, open `/search?q=file-based routing` — expect a video result whose label
   matches a real chapter ("Understanding File-Based Routing") and the lesson page to open
   with `?start=<chapter seconds>`.
2. Search `?q=agent loops` — expect lesson + video results for "Building an agent loop" with
   grounded counts.
3. Search a nonsense query (e.g. `?q=zzqqxx`) — expect the empty state pointing to the
   catalog, no fabricated results.
4. In Studio Vision, run `*[_type == "sanity.agentContext"]` to confirm exactly one document.
5. Confirm the dev server logs no MCP errors and results still render with sort controls.
