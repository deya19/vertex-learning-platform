# Implementation Prompt: Progress Bar Visual Fix

## Goal
Correct section 11, Progress Bar, on `/design-system` so it matches the supplied Figma reference: a short orange 35% fill inside a light-gray track, with `35% complete` aligned on the right.

## Inspected
- `app/design-system/page.tsx`: section 11 renders `.progress` with a fill `<span>`, `35%`, and `complete` text.
- `app/globals.css`: `.progress:before` renders the track and `.progress span` renders the fill, but the fill is absolutely positioned without a positioned parent, causing it to escape/overlay incorrectly.
- `design/vertex-designsystem.png`: source of truth shows the fill contained within the track at approximately 35% width.

## Decision
Fix only the progress bar CSS. Establish `.progress` as the containing block, anchor the fill to the track's left edge, and preserve the existing percentage and label layout. No markup, dependency, route, or unrelated styling changes.

## Expected file
- `app/globals.css`

## Requirements
- Fill remains inside the track.
- Fill width is approximately 35% of the track.
- Track is light gray and fill is Vertex orange.
- `35% complete` remains readable and right-aligned.
- Responsive layout remains intact.

## Checks
- Run `npm run lint`.
- Verify `http://localhost:3001/design-system` and compare section 11 with the supplied reference.
