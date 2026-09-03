# Improve search speed and reliability

## Goal

Make `/api/search` faster and stop the user-facing failures seen in dev:

- Latency today: 6–26s per search (logs show `POST /api/search 200 in 9–26s`).
- Failures today: `AI_NoOutputGeneratedError` → 502, `TimeoutError` → 504, both shown to the learner as "Search is temporarily unavailable."

Three fixes: remove per-request MCP connection overhead, make the LLM path fail fast and retry once, and add a deterministic server-side GROQ fallback so search still returns grounded results when the LLM/MCP path fails. The user approved the fallback approach.

## Skills read

- `create-agent-with-sanity-context` (`.claude/skills/create-agent-with-sanity-context/SKILL.md`) — MCP connection pattern, `/initial-context` caching guidance, `groq_query` tool.

## Code inspected

- `app/api/search/route.ts` — current route. Creates an MCP client per request (`createSearchContext()` then `close()` in `finally`), runs `generateText` with `Output.object` and `stopWhen: stepCountIs(8)`, awaits the success-path PostHog capture before responding, maps every upstream error to 502.
- `sanity/lib/search-context.ts` — per-request `createMCPClient` handshake; initial-context cached 5 min (keep).
- `app/search/search-results.tsx` — client already aborts stale requests and renders server error messages; no changes needed.
- `lib/posthog-server.ts` — `captureServerEvent` awaits `client.flush()` (network roundtrip) with `flushAt: 1`.
- `sanity/schemaTypes/documents/video.ts` — video docs: `url`, `chapters[]{startSeconds, label}`, `chunks[]{startSeconds, text}`.
- `sanity/lib/client.ts` / existing `serverClient` — reused for the fallback query (already used for the post-search lookup).
- Dev log: `AI_NoOutputGeneratedError` (model ended without structured output), 15s timeouts, successful runs 6–26s.

## Decisions and assumptions

- Keep the architecture: search is Sanity Context MCP + LLM (AGENTS.md §7). The fallback is an error path only, never the primary path.
- Keep `gpt-4o-mini` (env-overridable via `OPENAI_MODEL`). Latency is dominated by the agent loop and MCP handshake, not the model.
- The MCP client is cached module-level and reused across requests; on any request failure it is closed and nulled so the next request reconnects. Initial-context caching stays as is.
- Success-path PostHog capture becomes fire-and-forget so it no longer blocks the response. Failure captures stay awaited (error path latency is acceptable and keeps serverless from dropping the event).
- Fallback ranking is a simple, transparent score in JS (title matches > description/keyPoints > notes text), not an attempt to reproduce LLM ranking.
- New env var `SEARCH_TIMEOUT_MS` (default 30000) bounds the LLM path. Client keeps its existing behavior; the server error message is already displayed.

## Files to touch

- `sanity/lib/search-context.ts` — cache the MCP client; export a way to discard it.
- `app/api/search/route.ts` — timeout, retry, fallback, non-blocking success capture, richer failure types.
- `prompts/improve-search-speed-reliability.md` — this file.

No schema, UI, or client changes.

## Requirements

### 1. Reuse the MCP client (`sanity/lib/search-context.ts`)

- Module-level singleton: `createSearchContext()` returns the cached client when present; only the first call pays the handshake.
- Export `disposeSearchContext()` that closes the client and clears the singleton (and the initial-context cache) — called by the route on failure.
- Keep the existing initial-context fetch/cache logic unchanged.

### 2. Route changes (`app/api/search/route.ts`)

- Pass `abortSignal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)` to `generateText` so the LLM path fails fast and predictably instead of hanging.
- Catch `NoOutputGeneratedError` (exported from `ai`) separately from other errors: retry `generateText` once. If the retry also produces no output, go to the fallback.
- Also run the fallback when the LLM path succeeds but shapes to zero results (the LLM sometimes under-reports; the broader token match improves recall). A genuinely unmatched query still returns the normal zero-result response. If the fallback throws in this case, keep the zero-result response instead of erroring, since the primary path already succeeded.
- On timeout, MCP/tool errors, or a second `NoOutputGeneratedError`: run the deterministic GROQ fallback (below) and return its results with the same response shape. Only if the fallback itself throws return 502.
- Failure analytics: add a `failure_type` of `timeout` (504 response) vs `upstream` (502), and capture when the fallback rescued the request (`fallback_used: true` on the success event, plus a distinct event or property when the primary path failed).
- Success-path `captureServerEvent` for `search:query_submit` becomes fire-and-forget (`void`, with a `.catch` that logs) so the response is not blocked on a PostHog roundtrip.
- Tighten `SEARCH_SYSTEM_PROMPT` for convergence: instruct the model to prefer one comprehensive GROQ query (two at most) over many small ones, and to produce the structured output immediately after the queries return. Keep all existing grounding and matching rules. Keep `stopWhen: stepCountIs(8)`.

### 3. Deterministic GROQ fallback (in the route)

- Tokenize the query: lowercase, strip punctuation, drop stopwords and tokens shorter than 3 chars, cap at 8 tokens.
- One GROQ query via `serverClient` matching lessons where any token wildcards (`*token*`) against `title`, `description`, `keyPoints`, or `pt::text(notes)` (OR'd terms, token-based per AGENTS.md §11). Project the same fields as `SEARCH_RESULT_LOOKUP_QUERY` plus `pt::text(notes)`-derived match evidence is NOT needed — keep the projection to the lookup fields.
- Rank in JS: score = title token hits (weight 3) + description/keyPoints hits (weight 2) + notes hits (weight 1); ties keep Sanity's order. Cap at 20 lesson results.
- Video moments: for the top matched lessons that have a `videoUrl`, one GROQ query against `video` docs by URL, filtering `chapters` by token match on `label` (fall back to `chunks` text only when no chapter matches, per AGENTS.md §7). Take the earliest matching chapter/chunk per video, cap video results, and shape them through the same result-building code path as LLM results (reuse the existing lookup + `SearchApiResult` shaping so both paths produce identical response shapes).
- Every title, slug, timestamp, and count in a fallback response comes from query results — nothing invented. If the fallback matches nothing, return the normal zero-result response (which the UI already renders as the empty state), not an error.

### 4. Security

- No new secrets; fallback uses the existing server-only Sanity client and read token. No token or MCP access reaches the browser. Rate limiting and input validation unchanged.

## Acceptance criteria

- A repeat search is noticeably faster than today (no per-request MCP handshake; no blocking PostHog flush).
- Simulating an LLM failure (e.g. invalid `OPENAI_API_KEY` at runtime or a forced timeout) returns real grounded results from the fallback instead of an error, with `fallback_used: true` in the success event.
- `AI_NoOutputGeneratedError` no longer surfaces as a 502: one retry, then fallback.
- A hung LLM path returns within `SEARCH_TIMEOUT_MS` as 504 with the existing friendly message.
- Response shape is identical for LLM and fallback paths (client untouched).
- `npm run build` passes with no type or lint errors.

## Checks

- `npm run build`
- `npx tsc --noEmit` (if configured) — otherwise rely on build.

## Manual test steps

1. `npm run dev`, open `/search`, search `agent skills` — results render; note the response time in the dev log (should improve vs 9–26s baseline).
2. Search the same query twice — the second run should be faster (MCP client reused).
3. Temporarily set `OPENAI_API_KEY` to an invalid value in `.env.local` and restart — searching still returns grounded results (fallback path), and the dev log shows the fallback was used. Restore the key.
4. Set `SEARCH_TIMEOUT_MS=1000` and search — response arrives quickly as a timeout/fallback rather than hanging.
5. Search a nonsense query (`zzzqqq`) — zero-result empty state with the catalog link, no error.
6. Confirm PostHog still receives `search:query_submit` (Network tab or PostHog debug) after the success capture became fire-and-forget.
