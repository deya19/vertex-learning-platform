# Implementation Prompt: Use the Authenticated Server Client for Sanity Live

## Goal
Update `sanity/lib/live.ts` so `defineLive` uses the server-only authenticated `serverClient` for `sanityFetch` and `SanityLive`, passes the Sanity read token through `serverToken`, and does not configure `browserToken`.

## Skills read
- `sanity-best-practices` — Next.js and Sanity Live Content API guidance.

## Code inspected
- `sanity/lib/live.ts` currently imports `client` and passes it to `defineLive` without token configuration.
- `sanity/lib/client.ts` marks the module server-only and exports `serverClient`, configured with `process.env.SANITY_API_READ_TOKEN`.
- `AGENTS.md` requires private Sanity tokens to remain server-only and requires type checking, linting, and builds when server modules change.

## Decisions and assumptions
- The existing `serverClient` is the authenticated client intended for private dataset reads.
- `serverToken` should receive `process.env.SANITY_API_READ_TOKEN`.
- `browserToken` must be omitted rather than set to any token, preventing the read token from reaching the browser.
- Keep the change limited to `sanity/lib/live.ts`; no dependency or API changes are needed.

## Requirements
- Import `serverClient` from `./client`.
- Configure `defineLive` with `client: serverClient`.
- Configure `serverToken: process.env.SANITY_API_READ_TOKEN`.
- Leave `browserToken` unset.
- Preserve the existing exports and behavior otherwise.

## Security considerations
- Do not expose `SANITY_API_READ_TOKEN` through client code or `browserToken`.
- Preserve the server-only boundary provided by `sanity/lib/client.ts`.

## Acceptance criteria
- `sanity/lib/live.ts` uses `serverClient` in the `defineLive` configuration.
- `serverToken` is set to `process.env.SANITY_API_READ_TOKEN`.
- No `browserToken` property is present.
- Type checking, linting, and the production build pass.

## Checks
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Manual test steps
1. Start the Next.js app with `npm run dev` and confirm it starts without a Sanity Live configuration error.
2. Visit a page that uses `sanityFetch` and confirm content loads using the configured private Sanity token.
3. Confirm the browser bundle and rendered page do not expose `SANITY_API_READ_TOKEN`.
