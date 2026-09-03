# Add skeleton loading cards to the search page

## Goal

While a search is running, show skeleton placeholder cards that mirror the shape of the real search result cards (thumbnail block on the left, text lines on the right), as in the user's reference image. Replaces the current plain-text "Searching across your courses..." state.

## Skills read

- None new; UI-only change following the existing design system (AGENTS.md §3: reproduce the reference, reuse existing patterns).

## Code inspected

- `app/search/search-results.tsx` — `loading` currently renders `<div className="search-state">Searching across your courses...</div>`. Result cards are `.search-result-card` (grid `294px 1fr`, min-height 177px) with `.search-result-image` and `.search-result-copy`.
- `app/search/search.css` — single source of search page styles; no keyframes exist yet.

## Decisions and assumptions

- Show 3 skeleton cards — enough to fill the viewport without implying an exact count.
- Skeleton mirrors the video-result card layout (image block + topline/title/description/meta lines) since both result kinds share that grid.
- Shimmer via a CSS keyframe on light warm-gray blocks consistent with the page palette (#f4ece8-ish tones); respect `prefers-reduced-motion` by disabling the animation.
- No layout shift: skeletons use the same card grid, radius, and min-height as real cards.

## Files to touch

- `app/search/search-results.tsx` — add a `SearchSkeleton` component; render it when `loading`.
- `app/search/search.css` — add `.search-skeleton*` styles and the shimmer keyframe.

## Requirements

- `SearchSkeleton` renders 3 `<div className="search-skeleton-card">` inside the existing `.search-results-list` grid: left `.search-skeleton-thumb`, right column with 3–4 `.search-skeleton-line` blocks of varying widths (approximating topline, title, description, meta).
- Visible only while `loading` is true; error/empty/results states unchanged.
- Purely presentational; no data or analytics changes.

## Security

- Static markup and CSS only; no user data rendered.

## Acceptance criteria

- Searching shows skeleton cards shaped like result cards with a subtle shimmer; they are replaced by results (or empty/error state) when the request finishes.
- Reduced-motion users see static gray blocks instead of animation.
- `npm run build` passes.

## Checks

- `npm run build`

## Manual test steps

1. `npm run dev`, open `/search`, search any query — skeleton cards appear immediately and shimmer until results replace them.
2. Throttle to a slow search (or a long query) to observe skeletons for several seconds.
3. Verify empty state, error state, and results still render as before.
4. Narrow the viewport below 700px — skeletons stack like the real cards do.
