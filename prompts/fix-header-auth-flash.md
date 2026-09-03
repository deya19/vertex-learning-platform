# Fix: Header auth buttons flash signed-out state and throw Clerk error on click

## Goal

Gate the header auth slot on Clerk's *resolved* client session state instead of the server's request-time guess, so a signed-in visitor never sees Sign in / Sign up buttons and can never trigger Clerk's single-session modal error. Extract the duplicated header auth markup into one shared component.

## Problem (verified in code)

- `app/page.tsx:85-96`, `app/courses/page.tsx:56`, `app/courses/[slug]/page.tsx:64` all render the auth slot from the server via `const { isAuthenticated } = await auth()`: `<UserButton />` when authenticated, otherwise `<SignInButton mode="modal">` + `<SignUpButton mode="modal">`.
- On first paint Clerk's client session is not yet resolved, so a signed-in visitor can be served/paint the signed-out branch, click Sign in, and Clerk throws: "The <SignIn/> and <SignUp/> models are hidden because a user is already signed in..." (single-session mode; the unhandled error is the symptom).
- `app/search/search-results.tsx:121,190` has the same bug client-side: it branches on `useAuth().isSignedIn` without checking `isLoaded`, so it renders Sign in / Sign up during the unresolved window.
- `app/lessons/[slug]/page.tsx:68` renders `{isAuthenticated ? <UserButton /> : null}` — no sign-in button, so no error path there; out of scope for the click bug but it has the same duplicated markup.

## Skills and docs read

- `AGENTS.md` sections 5 (auth is Clerk, browser holds no token), 7 (auth decisions), 13 (checks).
- `node_modules/next/dist/docs/` App Router conventions for server/client component boundaries.
- Clerk `@clerk/nextjs` patterns: `useAuth()` returns `{ isLoaded, isSignedIn }`; components must hold the slot until `isLoaded` before branching. Confirmed against the existing `clerk-nextjs-patterns` skill templates in-repo.

## Code inspected

- `app/page.tsx` (header auth slot, server `auth()`)
- `app/courses/page.tsx` (same, inline single-line variant)
- `app/courses/[slug]/page.tsx` (same)
- `app/search/search-results.tsx` (client, `useAuth()` without `isLoaded` guard)
- `app/lessons/[slug]/page.tsx` (UserButton-only variant)
- `app/layout.tsx` (`ClerkProvider` already wraps the app)
- `components/PostHogIdentify.tsx` (existing client component convention, `components/` is the shared-component home)
- `package.json` (`@clerk/nextjs@^7.8.2`, `next@16.3.2`)

## Decisions and assumptions

- Create one shared **client** component `components/HeaderAuth.tsx` using `useAuth()`:
  - `!isLoaded` → render nothing (hold the slot; no dead buttons possible).
  - `isSignedIn` → `<UserButton />`.
  - otherwise → the existing `auth-actions` markup with `SignInButton mode="modal"` / `SignUpButton mode="modal"` and the same class names, so visuals are unchanged once resolved.
- Replace the conditional in all four affected spots (three server pages + search results). The server pages no longer need `auth()` for the header — remove the now-unused `auth()` import and call so lint stays clean. No other behavior on those pages depended on `isAuthenticated` (verified).
- Leave `app/lessons/[slug]/page.tsx` untouched: it has no sign-in button, so there is no error path; changing its signed-out slot would alter visuals beyond the reported bug.
- Rendering nothing while Clerk loads is accepted (brief empty slot) — it matches the report's prescribed fix ("hold the slot while Clerk loads") and avoids inventing skeleton UI.
- No changes to Clerk config, `proxy.ts`, or single-session mode; the error is unreachable once the buttons never render for signed-in users.

## Files to touch

- `components/HeaderAuth.tsx` — new shared client component.
- `app/page.tsx` — swap conditional for `<HeaderAuth />`, drop unused `auth()`.
- `app/courses/page.tsx` — same.
- `app/courses/[slug]/page.tsx` — same.
- `app/search/search-results.tsx` — swap conditional for `<HeaderAuth />`; drop the auth-slot use of `useAuth` if no other usage remains in the file (verify `isSignedIn` is not used elsewhere before removing the import).

## Requirements

1. `HeaderAuth` is a client component (`"use client"`) importing `useAuth`, `SignInButton`, `SignUpButton`, `UserButton` from `@clerk/nextjs`.
2. Branch order: `!isLoaded` → `null`; `isSignedIn` → `<UserButton />`; else the existing signed-out markup, byte-identical class names (`auth-actions`, `auth-link`, `auth-signup`).
3. All four call sites render `<HeaderAuth />` in the same position inside `.home-actions`, preserving the bell icon before it.
4. Remove dead `auth()`/`isAuthenticated`/`isSignedIn` code left behind at the call sites.
5. No comments added or removed beyond what is needed; match existing compact code style.

## Security considerations

- No keys or tokens involved; `useAuth` is client-safe and exposes only session state.
- Auth gating of private routes stays in `proxy.ts` middleware — untouched. This change is purely presentational state resolution in the header.
- The browser still never writes content or progress; no boundary is crossed.

## Acceptance criteria

- `npx tsc --noEmit` passes and `npm run lint` reports no new issues.
- `npm run build` succeeds.
- Signed-in visitor never sees Sign in / Sign up in the header on `/`, `/courses`, `/courses/[slug]`, `/search`, at any point during load.
- Signed-out visitor sees Sign in / Sign up once Clerk resolves, and clicking them opens the modal with no console error.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run dev` for manual verification.

## Manual test steps

1. Run `npm run dev` and open `http://localhost:3000` signed out: header shows Sign in / Sign up after Clerk loads; clicking Sign in opens the modal, no console error.
2. Sign in, then hard-reload `/`, `/courses`, a course detail page, and `/search` watching the header: the auth slot stays empty briefly, then shows the avatar/UserButton — Sign in / Sign up never appear.
3. While signed in, confirm no Clerk error appears in the console on any of those pages (the `wrappedChildClickHandler → openSignIn` error path is gone).
4. Sign out and confirm the buttons return on all four pages.
