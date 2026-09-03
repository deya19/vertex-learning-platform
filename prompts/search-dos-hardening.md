# Harden /api/search against DoS

## Goal

Close the denial-of-service and cost-amplification gaps found in a security review of `POST /api/search`. The endpoint is public, triggers an LLM call plus MCP/GROQ queries on every hit, and its only load-bearing defense is an in-memory, IP-keyed rate limiter that does not hold up in a real deployment. Fix the code-level gaps and make the rate limiter durable when infrastructure for it exists.

## Skills read

- AGENTS.md §5 (server-only boundaries), §7 (search decisions), §12 (pitfalls) — search stays MCP + LLM, writes and secrets stay server side.
- No new framework skills needed; `@upstash/ratelimit` used per its package docs for the optional durable limiter.

## Code inspected

- `app/api/search/route.ts` — current route. Has: Zod query validation (2–200 chars), in-memory per-IP rate limit (20/min, Map capped at 10k entries), 30s `AbortSignal.timeout` on the LLM path with one `NoOutputGeneratedError` retry, `stepCountIs(8)`, deterministic GROQ fallback (max 8 tokens, 20 lessons, 10 videos), Zod-validated LLM output re-grounded via a Sanity lookup.
- `sanity/lib/search-context.ts` — module-level cached MCP client; `getInitialContext` fetch has no timeout.
- `lib/posthog-server.ts` — `captureServerEvent` performs a network roundtrip; failure paths in the route `await` it.
- No `middleware.ts` exists in the repo.

## Findings being fixed

1. `searchResponseSchema.results` is unbounded — a model response with thousands of entries flows into `slug.current in $lessonSlugs` (expensive Sanity query per request).
2. `request.json()` buffers the entire request body before the 200-char validation runs — oversized bodies consume memory/CPU.
3. Rate limiter weaknesses: in-memory Map is per-instance (serverless resets it); keyed on spoofable `x-forwarded-for`; all header-less clients share one `'unknown'` bucket; no per-user limit; no concurrency cap (20 simultaneous in-flight LLM calls per IP allowed).
4. `NoOutputGeneratedError` retry can double LLM spend per request and is attacker-triggerable.
5. No timeouts on the fallback fetch, the result-lookup fetch, or the initial-context fetch — a hung upstream holds the connection past the deadline.
6. Prompt injection through the 200-char query can drive the `groq_query` MCP tool to return huge payloads (e.g. full transcript chunks); the system prompt discourages this but nothing enforces it.
7. Minor: failure paths `await` PostHog capture (hot path under attack); the 503 response echoes missing env var names; `x-posthog-distinct-id` header is attacker-controlled.

## Decisions and assumptions

- Keep the architecture and all existing behavior (grounding, fallback, timeout budget) — this is hardening, not a redesign.
- Rate limiting keys on the Clerk user id for authenticated requests (stronger identity, immune to IP spoofing) and on IP otherwise. Keep the in-memory limiter as the always-present fallback.
- Add a durable distributed limiter with `@upstash/ratelimit` + `@upstash/redis`, used only when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set; otherwise fall back to the in-memory limiter. No code path requires Upstash, so dev and preview keep working.
- Add a global in-flight concurrency cap (default 8) — this is the cheapest protection for LLM spend and works even when the rate limiter is bypassed.
- Body size is capped by checking `Content-Length` and by reading the body through a byte-limited reader (covers chunked encoding). 4 KB cap is generous for a `{query: string}` payload.
- The `groq_query` tool is wrapped with a response-size guard so an injected instruction cannot pull megabytes of transcript through the MCP.
- `NoOutputGeneratedError` retry stays (it rescues real flakiness) but only when the deadline allows — unchanged from current logic; the concurrency cap plus rate limit bound the amplification it enables.
- Failure-path PostHog captures become fire-and-forget like the success path; under a flood, the failure path is the hot path and must not block on a network roundtrip.
- The 503 configuration error no longer names the missing env vars.
- Sanity fetches get their own abort timeouts (10s) so a hung upstream cannot outlive the request budget. `getInitialContext` gets the same treatment.
- `x-forwarded-for` trust is a deployment concern: on Vercel the platform overwrites it; self-hosted deployments must sit behind a proxy that does. Documented, not code.

## Files to touch

- `app/api/search/route.ts` — all route-level fixes.
- `sanity/lib/search-context.ts` — timeout on the initial-context fetch.
- `package.json` — add `@upstash/ratelimit` and `@upstash/redis` via `npm install` (not hand-edited).
- `prompts/search-dos-hardening.md` — this file.

No schema, UI, or client changes.

## Requirements

### 1. Bound the LLM output (`app/api/search/route.ts`)

- `searchResponseSchema.results` gets `.max(50)`.
- Before the lookup fetch, slice `output.results` to 50 and dedupe `lessonSlug` values so `$lessonSlugs` is bounded regardless of schema changes.

### 2. Reject oversized request bodies

- In `POST`, before parsing: if the `Content-Length` header exceeds 1024 bytes, return 413 with a JSON error.
- Read the body through a small byte-capped reader (read the stream, abort with a 413 once more than 1024 bytes are consumed) so chunked bodies without `Content-Length` are also bounded. JSON parse errors from truncation map to the existing 400 invalid-JSON path or 413, whichever triggered.

### 3. Rate limiting

- Extract a `checkRateLimit(request)` that:
  - Resolves the identity: Clerk `userId` when authenticated, else `x-real-ip`, else first `x-forwarded-for` entry, else `'unknown'`.
  - When Upstash env vars are present: fixed-window limit (`SEARCH_RATE_LIMIT_MAX` per `SEARCH_RATE_LIMIT_WINDOW_MS`) keyed `search:{identity}` via `Ratelimit` with `Duration` mapped from the window; on block, use its reset for `Retry-After`.
  - Otherwise: the existing in-memory Map logic, unchanged in behavior, now keyed by the same identity.
- Keep counting rate-limited requests (do not reset the window on a 429).
- The `'unknown'` shared bucket stays (header-less clients are rare behind a real proxy) but is documented in a comment as a known limitation.

### 4. Global concurrency cap

- Module-level counter `inFlightSearches` with env override `SEARCH_MAX_CONCURRENT` (default 8).
- Increment after rate-limit and validation pass; decrement in `finally`. When at the cap, return 429 with `Retry-After: 5` and capture a `failure_type: 'concurrency'` event.

### 5. Timeouts on downstream fetches

- `runFallbackSearch` and the `SEARCH_RESULT_LOOKUP_QUERY` fetch accept an `AbortSignal` and pass it to `serverClient.fetch` via its request options (`{signal}`), using `AbortSignal.timeout(10000)` derived from the request deadline (whichever is sooner).
- `getInitialContext` fetch gets `signal: AbortSignal.timeout(10000)`. If the `next: {revalidate: 300}` option conflicts with passing a signal in this Next.js version, drop `next.revalidate` and rely on the existing module-level TTL cache instead — the cache already prevents repeat fetches.

### 6. Bound the MCP tool response

- Wrap the `groq_query` tool before passing it to `generateText`: keep the tool's metadata, replace `execute` so the JSON-stringified result is measured and a response over `SEARCH_MCP_MAX_RESPONSE_BYTES` (default 100000) throws a clear error (which routes the request to the existing fallback). This enforces the "keep GROQ responses small" system-prompt rule server side.

### 7. Failure-path latency and info disclosure

- All `captureFailure` calls become fire-and-forget (`void captureServerEvent({...}).catch(...)` logging), matching the success path.
- The 503 configuration response returns `{error: 'Search is not configured.'}` with no env var names; the names stay in the server log only.

## Security considerations

- No secrets in code or logs; the Upstash URL/token stay in env and are only read server side.
- Rate-limit keys and identities are never echoed in responses.
- The tool wrapper must not log tool output (it can contain content data); only sizes on rejection.
- All new env vars are optional with safe defaults; nothing new is exposed to the browser. The route remains server-only (`runtime = 'nodejs'`, server-only clients).
- Spoofed `x-posthog-distinct-id` remains possible (bounded to 200 chars); out of scope here — analytics pollution, not DoS.

## Acceptance criteria

- A request with `Content-Length > 1024` or an oversized chunked body gets 413 and never reaches Zod validation.
- The 21st search from one identity within the window gets 429 with a `Retry-After` header.
- When `SEARCH_MAX_CONCURRENT` is exceeded, requests get 429 and the counter always returns to zero (no leak on error paths).
- A model output with more than 50 results is rejected by Zod and the request falls back instead of erroring.
- A `groq_query` response over the byte cap throws and the request still returns grounded fallback results.
- A hung Sanity fetch cannot extend the request past its deadline.
- With Upstash env vars set, the limit is enforced across simulated separate processes (two `next dev` instances on different ports share the budget); without them, behavior is unchanged from today.
- Responses never disclose which env vars are missing.

## Checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Manual test steps

1. `npm run dev`, open the site, run a normal search — results render as before.
2. `curl -i -X POST http://localhost:3000/api/search -H "Content-Type: application/json" --data-binary @big.json` (a >1KB JSON file) — expect 413.
3. `curl -i -X POST http://localhost:3000/api/search -H "Content-Type: application/json" -d '{"query":"'"$(python -c 'print("a"*300)')"'"}'` — expect 400 with the length message.
4. Rapidly fire 21 searches (loop `curl`) — expect 429 with `Retry-After` on the later ones; wait out the window and confirm search works again.
5. Temporarily rename `OPENAI_API_KEY` in `.env.local`, restart, search — expect 503 with the generic message (no var names), and the names visible in the server terminal log.
6. With `SEARCH_MAX_CONCURRENT=1`, fire two searches simultaneously — expect one to succeed and one to get 429.
