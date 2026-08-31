# Implementation Prompt: Fix auth header loading state

## Goal
Stop signed-in visitors from briefly seeing the Sign in / Sign up buttons in the
header and clicking a button that does nothing and throws a Clerk error. Gate the
auth buttons on Clerk's resolved client state, and pull the duplicated header into
one shared component so all pages get the fix once.

## Skills and guidance read
- `AGENTS.md` and `CLAUDE.md` repository rules.
- Next.js App Router server/client boundary conventions (installed `next` 16.3.2).
- Clerk `@clerk/nextjs` 7.8.2 in-package types: `Show`, `ClerkLoading`, `ClerkLoaded`,
  and the Core 3 note that `SignedIn` / `SignedOut` were removed for `Show`.

## Code inspected
- `app/page.tsx`, `app/courses/page.tsx`, `app/courses/[slug]/page.tsx`: each renders
  the same header actions block with `<Show when="signed-out">` around the auth buttons
  and `<Show when="signed-in">` around `<UserButton />`. All three are async server
  components (RSC).
- `app/layout.tsx`: `<ClerkProvider>` wraps the app; there is no `clerkMiddleware`.
- `components/PostHogIdentify.tsx`: existing `"use client"` component style.
- `app/globals.css`: `.home-header`, `.course-header`, `.home-actions`, `.auth-actions`
  styles.
- `node_modules/@clerk/nextjs/dist/esm/package.json`: `#components` resolves to
  `components.server.js` under the `react-server` condition and `components.client.js`
  otherwise. So RSC pages use the server `Show` (static `auth()`), while a `"use client"`
  module uses the client `Show` (reactive `useAuth`).

## Root cause
The header is rendered by server components, so `Show` is the server variant that resolves
auth statically. `ShowWhenCondition` has no loading state, and the server render (with no
`clerkMiddleware`) produces the signed-out header. The browser therefore shows the auth
buttons until the client Clerk session resolves. Clicking Sign in then calls `openSignIn`,
which Clerk refuses in single-session mode, raising the tracked exception.

## Decisions and assumptions
- Move the auth control into a `"use client"` component so `Show` becomes the reactive
  client variant and reflects the real browser session.
- Hold the header slot with `<ClerkLoading>` while Clerk loads, then render either the
  auth buttons (`<Show when="signed-out">`) or `<UserButton />` (`<Show when="signed-in">`)
  inside `<ClerkLoaded>`. No auth button is clickable before the session resolves.
- Pull the whole header into one shared `SiteHeader` server component. It keeps the exact
  same DOM and class names, takes a `className` prop (default `home-header`) so the course
  detail page can pass `course-header`, and renders the client `HeaderAuth` island.
- Do not add `clerkMiddleware`. Browsing is public and no route is protected, so the client
  session is the source of truth for the header.
- Do not restyle. Add only a small, subtle loading placeholder.

## Expected files to touch
- `components/HeaderAuth.tsx` (new): client auth island.
- `components/SiteHeader.tsx` (new): shared header.
- `app/page.tsx`, `app/courses/page.tsx`, `app/courses/[slug]/page.tsx`: use `SiteHeader`,
  drop the duplicated header markup and now-unused Clerk imports.
- `app/globals.css`: add `.auth-actions-placeholder`.

## Requirements
- A signed-in visitor never sees the Sign in / Sign up buttons and cannot click a dead one.
- The header shows a neutral placeholder while Clerk loads, then the correct control.
- The header layout and styles match the current design on all three pages.

## Security considerations
- No tokens or secrets touched. The client component uses only Clerk's public client state.

## Acceptance criteria
- Type check and lint pass.
- Production build passes.
- Manual check confirms no auth-button flash for a signed-in user and no console error.

## Checks to run
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run dev` and load `/`, `/courses`, `/courses/<slug>` signed in and signed out.

## Manual test steps
1. Sign in, then hard-reload `/`. Confirm the header shows the placeholder, then the user
   avatar, and never the Sign in / Sign up buttons.
2. Repeat on `/courses` and a `/courses/<slug>` page.
3. Sign out and reload. Confirm the Sign in / Sign up buttons appear and open the modal.
