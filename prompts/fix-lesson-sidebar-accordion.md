# Fix lesson sidebar accordion toggle

## Goal
Make the lesson page sidebar module arrows open and close their lesson lists when clicked. The currently active module is expanded on initial render, matching the existing screenshot, while collapsed modules remain collapsed until selected.

## Skills and guidance read
- Repository instructions in `AGENTS.md`.
- Next.js App Router server/client boundary guidance was located in `node_modules/next/dist/docs/`; direct reads were blocked because `node_modules` is ignored by repository access rules. The implementation will follow the existing client component pattern.

## Code inspected
- `app/lessons/[slug]/page.tsx`: the async server page currently renders every module row as a non-interactive `<div>`, always renders only the current module's lessons, and has no client-side accordion state.
- `app/lessons/[slug]/lesson-player.tsx`: existing client component using `useState` for interactive lesson UI; suitable location for a small client-only sidebar component if needed.
- `app/lessons/[slug]/lesson.css`: existing sidebar/module styling should be preserved and only receive the minimum state/interaction styles required.
- `package.json`: Next.js 16, React 19, TypeScript, and ESLint are already available; no dependency is needed.
- No test files or test runner were found.

## Decisions and assumptions
- Use a focused client component for the interactive accordion rather than converting the data-fetching lesson page to a client component.
- Keep the server page responsible for Sanity data fetching and links.
- Initialize the active module open, because it contains the current lesson and is open in the reference image.
- Allow only one module to be open at a time so selecting a different module replaces the visible lesson list; clicking the open module closes it.
- Preserve existing navigation behavior: lesson links still navigate to their lesson pages, and clicking a module row only toggles the list.
- The top `Module X of Y` heading arrow is not a module list row and will not be changed unless the existing structure demonstrates that it is intended to control the accordion.
- Do not alter the visual design beyond making the arrow/row an accessible control and reflecting expanded/collapsed state.

## Expected files to touch
- `app/lessons/[slug]/page.tsx`: extract the module list into the client accordion component and pass serializable course/module/lesson data.
- `app/lessons/[slug]/lesson-sidebar.tsx` (new, if the existing component layout supports it): implement stateful module toggling and accessible buttons.
- `app/lessons/[slug]/lesson.css`: only if needed for button reset, cursor/focus behavior, or chevron rotation/state styling.

## Requirements
1. The current module is open on first render.
2. Clicking a collapsed module row opens its lesson list and closes the previously open module.
3. Clicking the currently open module row closes its lesson list.
4. The arrow is part of a real `button` control with an accessible label/state (`aria-expanded` and an associated region where appropriate).
5. The selected/current lesson remains visually identified exactly as before.
6. Module and lesson links retain their current URLs and work after toggling.
7. Keep Sanity access and other server-only behavior on the server; do not expose tokens or move data fetching into the browser.
8. Avoid unrelated visual, content, or layout changes.

## Security considerations
- Pass only already-rendered, serializable lesson/module data into the client component.
- Do not add client-side Sanity access, tokens, mutations, or new dependencies.

## Acceptance criteria
- On the lesson page, clicking the down arrow for a collapsed module shows that module's lessons.
- Clicking the up arrow for an expanded module hides its lessons.
- Only the intended module list changes; the rest of the page remains stable.
- Keyboard activation with Enter/Space works because the control is a button.
- `aria-expanded` matches the visible state.
- TypeScript and ESLint pass.

## Checks to run
- `npm run lint`
- `npx tsc --noEmit`
- Run the dev server with `npm run dev` and manually verify the lesson sidebar.

## Manual test steps
1. Start the app with `npm run dev`.
2. Open a lesson page that has multiple modules.
3. Confirm the current module is expanded initially.
4. Click its arrow/row and confirm its lesson list closes.
5. Click another module's arrow/row and confirm its lesson list opens while the prior list stays closed.
6. Click the open module again and confirm it closes.
7. Use Tab and Enter/Space on a module control and confirm the same behavior.
8. Open a lesson link from an expanded module and confirm navigation and current-lesson styling still work.
