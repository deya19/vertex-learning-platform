# Implementation Prompt: Notifications Control Fix

## Goal
Remove the focusable no-op Notifications button from the static home page while preserving the existing bell appearance.

## Finding verification
`app/page.tsx` line 108 renders a `<button>` with no handler or linked destination. The finding is valid because it exposes an interactive control that has no action.

## Decision
Replace the button with a non-focusable `<span className="icon-button" aria-hidden="true">` containing the existing bell icon. Reusing the current class preserves the visual dimensions and styling; `aria-hidden` correctly treats the presentational bell as decorative until notifications are implemented.

## Expected files
- `app/page.tsx`: replace only the no-op Notifications button markup.
- `prompts/notifications-control-fix.md`: this implementation record.

## Acceptance criteria
- No focusable no-op Notifications control remains on the home page.
- The bell keeps its current visual appearance.
- No notification functionality is invented.
- Lint, route, and diff validation pass.
