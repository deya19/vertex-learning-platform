# Implementation Prompt: Design-System Breakpoint Fix

## Goal
Restore the design-system responsive breakpoint to 1000px without undoing the home page's 1440px content width.

## Finding verification
The current `app/globals.css` has a single design-system media query at `@media (max-width: 1440px)` containing `.intro`, `.row-two`, `.row-three`, `.lower`, `.mini-row`, `.cards`, `.swatches`, `.nav-samples`, `.nav-bar`, and `.principles`. The home page's 1440px values are separate in `.home-shell` and `.home-shell::before/.home-shell::after`. The finding is valid.

## Decision
Change only the design-system media-query threshold from 1440px back to 1000px. Leave `.home-shell` and its side-texture calculations at 1440px. No markup or other styling changes.

## Expected files
- `app/globals.css`: restore the first responsive media query threshold.
- `prompts/design-system-breakpoint-fix.md`: this implementation record.

## Acceptance criteria
- Design-system selectors continue switching layout at 1000px.
- Home shell and side texture remain based on 1440px.
- No unrelated changes are introduced.
- Lint passes, the root route returns HTTP 200, and the diff is clean.
