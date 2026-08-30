# Fix PostHog lazy-script loading errors

## Goal
Stop the four PostHog browser console errors reported in Next.js 16.3.2/Turbopack:
- SessionRecording: could not load recorder
- ExceptionAutocapture: failed to load script
- Surveys: Could not load surveys script
- Conversations: Could not load conversations script

Keep PostHog analytics, session replay, exception autocapture, surveys, and conversations functional rather than hiding errors by disabling products.

## Skills and guidance read
- `integration-nextjs-app-router` at `.claude/skills/integration-nextjs-app-router/SKILL.md`
- Its `references/3-revise.md`, `references/COMMANDMENTS.md`, and `references/next-js.md`
- Repository rules in `AGENTS.md`

Relevant guidance: initialize client PostHog from `instrumentation-client.ts`; use environment variables; when proxying, both `/static/*` and `/array/*` must route to the PostHog assets origin; preserve optional configuration behavior; do not import `posthog-js` server-side.

## Code inspected
- `instrumentation-client.ts`: initializes `posthog-js` with `api_host: "/ingest"`, `ui_host`, defaults, and exception capture.
- `next.config.ts`: rewrites `/ingest/static/*` and `/ingest/array/*` to the US PostHog assets host, and other `/ingest/*` paths to the US API host.
- `components/PostHogIdentify.tsx`: identifies Clerk users after initialization.
- `lib/posthog-server.ts`: server-side `posthog-node` client.
- `app/layout.tsx` and PostHog event components: client usage and current integration boundaries.
- `package.json`: Next.js 16.3.2, `posthog-js` 1.422.5, and `posthog-node` 5.51.4.

Local verification showed the existing `/ingest/static/recorder-v2.js`, `/ingest/static/recorder.js`, `/ingest/static/surveys.js`, `/ingest/static/exception-autocapture.js`, `/ingest/static/conversations.js`, and `/ingest/flags/` endpoints return HTTP 200 from the running app. Therefore, inspect the actual browser-loaded URLs and response behavior before changing code; do not assume the proxy is the only cause. Check whether the client is using the configured host versus the local proxy, whether lazy-loaded scripts are loaded through the intended asset route, and whether a stale dev server or response headers/content type are involved.

## Expected files
- Likely `instrumentation-client.ts` and/or `next.config.ts`.
- Add or update tests only if the repository has an appropriate existing test pattern.
- Do not modify unrelated course or analytics event code.

## Requirements
1. Keep all PostHog client requests consistent with one configured US host/proxy strategy.
2. Ensure every lazy-loaded PostHog asset required by the enabled products is reachable through the chosen strategy, including recorder, exception autocapture, surveys, and conversations scripts.
3. Preserve the public project token boundary and do not expose any private key.
4. Do not suppress the console errors by turning off the affected products unless the product is intentionally unavailable; if a product must be disabled, document the reason and scope in the final report.
5. Preserve the current Clerk identity behavior and event capture behavior.
6. Keep the config compatible with Next.js 16.3.2 and Turbopack.

## Security considerations
- Never read, print, commit, or change secret values in `.env.local`.
- Only `NEXT_PUBLIC_*` PostHog project configuration may be used in browser code.
- Keep `posthog-node` server-only.
- Do not add permissive or unrelated proxy routes.

## Acceptance criteria
- `instrumentation-client.ts` uses a valid, coherent PostHog host/proxy configuration.
- Browser requests for the four affected lazy scripts succeed with JavaScript content and do not produce the reported PostHog load errors.
- `npm run lint` passes.
- Type checking passes using the repository's TypeScript command.
- `npm run build` passes because Next config and client initialization are involved.
- Missing PostHog configuration still leaves the app bootable and production behavior remains a no-op.

## Checks
1. Run the repository lint script.
2. Run `npx tsc --noEmit`.
3. Run `npm run build`.
4. Start a fresh dev server after any `next.config.ts` change; do not rely on a stale server.
5. Verify the affected `/ingest/static/*` requests return successful JavaScript responses.
6. Open the app in a browser with the devtools console and network panel, reload, and confirm the four reported errors are absent. If a browser extension blocks PostHog, repeat in a clean/incognito profile before judging the integration.

## Manual test steps
1. Stop any existing Next dev server and start a fresh one with `npm run dev`.
2. Open the app URL in a clean browser profile.
3. Reload with the network panel open.
4. Confirm recorder, exception-autocapture, surveys, and conversations script requests use the intended host/path and return HTTP 200 JavaScript responses.
5. Confirm the console contains no corresponding PostHog lazy-script load errors.
6. Exercise an existing tracked course action and confirm it still captures normally in PostHog.
