# Fix: PostHog proxy forwards Clerk session cookies to PostHog (CWE-200)

## Goal

Stop the `/ingest` reverse proxy from forwarding the browser's `Cookie` (and `Authorization`) headers to PostHog's servers, so Clerk session cookies never cross the application-to-PostHog trust boundary.

## Problem (verified in code)

- `instrumentation-client.ts:15` sets `api_host: "/ingest"`, so the browser sends PostHog events same-origin.
- `next.config.ts:7-22` rewrites `/ingest/*` to `https://us.i.posthog.com/*` and `https://us-assets.i.posthog.com/*`. Next.js external rewrites forward the incoming request headers, including `Cookie`.
- Because the requests are same-origin, the browser attaches the app's cookies (`__session`, `__client`) to every `/ingest` request. The rewrite proxies those cookies to PostHog.
- `proxy.ts` (Clerk, Next.js 16 proxy convention) does not help today:
  - Its matcher excludes static asset extensions, so `/ingest/static/*.js` bypasses the proxy entirely and still leaks cookies via the rewrite.
  - For non-asset `/ingest` paths, Clerk runs but never strips the cookie header.

## Skills and docs read

- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — Next.js 16 renamed Middleware to Proxy; `proxy.ts` convention confirmed.
- `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md` — confirms `NextResponse.next({ request: { headers } })` in Proxy "modifies the headers your server receives" (downstream, including rewrites), and is the sanctioned way to change upstream request headers.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md` — rewrite order: headers → redirects → proxy → rewrites, so proxy header edits land before the external rewrite forwards them.
- `AGENTS.md` sections 5, 6, 7 (analytics and auth boundaries).

## Code inspected

- `next.config.ts` (rewrites, `skipTrailingSlashRedirect`)
- `instrumentation-client.ts` (PostHog init, `api_host: "/ingest"`)
- `proxy.ts` (clerkMiddleware + matcher)
- `package.json` (scripts, deps: `@clerk/nextjs@^7.8.2`, `next@16.3.2`)

## Decisions and assumptions

- Keep the same-origin proxy (it is required for ad-blocker resilience and the PostHog recommended setup); only strip the sensitive headers.
- Strip `cookie` and `authorization` in the proxy for all `/ingest` paths. PostHog does not need either; identity is carried in the event body via `distinct_id`.
- Add `/ingest/:path*` to the proxy matcher so static `/ingest/static/*.js` requests also pass through the proxy and get stripped (they currently bypass it).
- Return early for `/ingest` before calling `clerkMiddleware()`, so Clerk does no work on analytics traffic.
- Do not touch `next.config.ts` or `instrumentation-client.ts`; the fix is entirely in `proxy.ts`.
- Assumption: no other feature relies on reading cookies from `/ingest` requests server-side (none exists in the code).

## Files to touch

- `proxy.ts` — only file modified.

## Requirements

1. In `proxy.ts`, detect requests whose pathname starts with `/ingest`.
2. For those requests, build a copy of the request headers with `cookie` and `authorization` removed and return `NextResponse.next({ request: { headers } })` so the external rewrite forwards the stripped headers.
3. Add `"/ingest/:path*"` as the first entry in the `config.matcher` array so asset requests under `/ingest/static` are also covered.
4. All other requests keep going through `clerkMiddleware()` unchanged.
5. No comments added or removed beyond what is needed; keep the existing code style.

## Security considerations

- Clerk session JWTs (`__session`) and the `__client` cookie stop being sent to `us.i.posthog.com` / `us-assets.i.posthog.com`.
- The proxy itself never logs or stores header values.
- No tokens or secrets are introduced; PostHog's public token stays public.

## Acceptance criteria

- `npx tsc --noEmit` passes and `npm run lint` reports no new issues.
- `npm run build` succeeds.
- A request to any `/ingest` path (including `/ingest/static/...`) reaching the proxy no longer carries `cookie` or `authorization` downstream.
- Non-`/ingest` routes still run Clerk middleware (sign-in gating unchanged).

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Manual test steps

1. Run `npm run dev`.
2. Header-strip verification: start a tiny echo server (e.g. `node -e` http server on port 3001 that prints `req.headers.cookie`), temporarily point the `/ingest/:path*` rewrite destination at `http://localhost:3001/:path*`, then run `curl -s -H "Cookie: __session=secret" http://localhost:3000/ingest/batch` and confirm the echo server sees no `cookie` header. Revert the temporary destination change afterwards.
3. Regression: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ingest/static/xx.js` should still proxy to PostHog (200-series), and visiting the site signed in with Clerk should still show session-gated UI working.
4. Confirm PostHog events still arrive: open the app with the browser devtools network tab, filter `ingest`, and see `batch`/`e` POSTs returning 2xx.
