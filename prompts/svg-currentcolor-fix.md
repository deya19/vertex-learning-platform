# Implementation Prompt: SVG Currentcolor Keyword Fix

## Goal
Update the home page SVG rule to use the lowercase CSS keyword `currentcolor` as requested by the Stylelint value-keyword-case rule.

## Finding verification
The current `app/globals.css` contains `.home-shell svg{fill:none;stroke:currentColor;...}`. This is the reported occurrence, so the finding is valid.

## Decision
Change only `stroke:currentColor` to `stroke:currentcolor` in the `.home-shell svg` rule. Preserve the cascade and all other styles.

## Expected files
- `app/globals.css`: one value-case correction.
- `prompts/svg-currentcolor-fix.md`: this implementation record.

## Acceptance criteria
- `.home-shell svg` uses `stroke:currentcolor`.
- No unrelated values or selectors change.
- Lint and diff validation pass.
