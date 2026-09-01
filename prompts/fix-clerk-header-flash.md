---
title: Fix Clerk header auth flash and single-session warning
---

## Goal
Stop the home, all-courses, and course-detail pages from flashing the **Sign in / Sign up** buttons after a user is already signed in, and eliminate the Clerk dev-console warning that `<SignIn/>` and `<SignUp/>` modals are being hidden in single-session mode.

## Skills consulted
- `clerk` and `clerk-nextjs-patterns` skills: use `await auth()` from `@clerk/nextjs/server` in Server Components for the source of truth, and keep `<UserButton>`, `<SignInButton>`, and `<SignUpButton>` as client components. Remove the client-only `<Show>` control that defaults `treatPendingAsSignedOut` to `true`, which renders the sign-in buttons before Clerk has finished loading the session.

## Code inspected
- `app/page.tsx` — header uses `<Show when="signed-out">` for the auth buttons and `<Show when="signed-in">` for `<UserButton>`.
- `app/courses/page.tsx` — same header pattern as home.
- `app/courses/[slug]/page.tsx` — same header pattern as home.
- `app/lessons/[slug]/page.tsx` — header has a hardcoded `<span className="lesson-avatar">MK</span>` instead of a real user avatar.
- `app/layout.tsx` — `<ClerkProvider>` is already at the root and does not need changes.
- `package.json` — `@clerk/nextjs` is `^7.8.2` (Clerk Core 3).

## Decisions and assumptions
1. The `Show` component is the cause of the flash: with `treatPendingAsSignedOut` defaulting to `true`, it renders the `SignInButton` / `SignUpButton` branches while the session is still loading. Those buttons mount the `<SignIn/>` and `<SignUp/>` modal roots, so when the user is already signed in Clerk emits the single-session warning.
2. The fix is to resolve auth state server-side with `await auth()` and conditionally render the correct header branch. This removes the loading ambiguity entirely.
3. While the bug is most visible on the home page, the exact same pattern is duplicated on the courses and course-detail pages, so all three should be fixed to prevent the issue elsewhere.
4. The lesson page's hardcoded `MK` avatar is directly visible in the user's repro steps, so it will be replaced with `<UserButton>` there as a one-line consistency fix.

## Files to touch
- `app/page.tsx`
- `app/courses/page.tsx`
- `app/courses/[slug]/page.tsx`
- `app/lessons/[slug]/page.tsx`

## Requirements
- In `app/page.tsx`, `app/courses/page.tsx`, and `app/courses/[slug]/page.tsx`:
  - `import { auth } from "@clerk/nextjs/server"`.
  - In the page component, `const { isAuthenticated } = await auth();`.
  - In the header `home-actions` block, replace `<Show when="signed-out">` and `<Show when="signed-in">` with a single conditional: if `isAuthenticated`, render `<UserButton />`; otherwise render the `SignInButton` / `SignUpButton` modal buttons.
  - Keep the existing `className` and styling on the buttons and wrapping `div` unchanged.
- In `app/lessons/[slug]/page.tsx`:
  - Import `UserButton` and `auth` (or just `UserButton` if it is safe to leave un-gated).
  - Replace the hardcoded `<span className="lesson-avatar">MK</span>` with a server-auth conditional: show `<UserButton />` when `isAuthenticated`, otherwise keep only the notifications bell (do not add new sign-in buttons on this page).
- Do not change `app/layout.tsx`, `app/sign-in/[[...sign-in]]/page.tsx`, or `app/sign-up/[[...sign-up]]/page.tsx`.
- Do not move the header into a shared component unless the user requests it later — keep edits in place.

## Security considerations
- `auth()` runs only on the server. No Clerk token or session state is exposed to the browser.
- The decision to show `UserButton` vs sign-in buttons is made server-side, but the actual `UserButton` and `SignInButton` components remain client-side primitives from Clerk; this preserves Clerk's security model.

## Acceptance criteria
1. After signing in, navigating from the home page to a lesson and then back to the home page no longer shows the **Sign in / Sign up** buttons.
2. The Clerk dev-console warning about hidden `<SignIn/>` / `<SignUp/>` modals in single-session mode no longer appears on the home, all-courses, or course-detail pages.
3. The signed-in state is reflected correctly on first render of those pages.
4. The lesson page displays the real account avatar when signed in instead of the hardcoded `MK`.

## Checks to run
- `npx tsc --noEmit` (or `npm run build` if configured) to confirm the `auth()` import and conditional render are type-safe.
- No new lint errors from the edited files.

## Manual test steps
1. Start the dev server (`npm run dev`) and sign in.
2. Go to `http://localhost:3000/` — the header should show the user avatar, not **Sign in / Sign up**.
3. Click into a course, then a lesson, then the browser back button to the home page — the header should still show the user avatar.
4. Open the browser dev console and confirm the `cannot_render_single_session_enabled` warning is gone.
5. Open an incognito window without signing in — the header should show **Sign in / Sign up**.
6. Open a lesson while signed in — the top-right avatar should be your user avatar, not `MK`.
