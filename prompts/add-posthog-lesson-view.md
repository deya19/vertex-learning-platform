# Add the PostHog lesson detail view event

## Goal
Add a dedicated `lesson:detail_view` PostHog event when a valid lesson detail page becomes visible, supplementing automatic `$pageview` with stable lesson context.

## Guidance and code inspected
- Read the `integration-nextjs-app-router` PostHog skill and repository `AGENTS.md` workflow.
- Inspected `app/lessons/[slug]/page.tsx`, `app/lessons/[slug]/lesson-actions.tsx`, and `components/PostHogIdentify.tsx`.
- The lesson page is a server component with canonical Sanity lesson/course/module context.
- `lesson-actions.tsx` is the existing client analytics boundary for lesson interactions.

## Decisions
- Use the existing `category:object_action` taxonomy: `lesson:detail_view`.
- Views are an accepted funnel exception to the event-handler rule. Capture through a small client component whose effect synchronizes the rendered route with PostHog.
- Guard against duplicate capture for the same component instance, including React development effect replay.
- Use only stable, non-PII properties: `lesson_slug`, `course_slug`, one-based `module_index`, one-based `lesson_index`, `start_second`, `start_source`, and `is_authenticated`.
- Do not include titles, descriptions, URLs, Clerk profile fields, or other authored text.
- Keep automatic `$pageview` enabled; the custom event adds business context rather than replacing it.

## Expected files
- `app/lessons/[slug]/lesson-actions.tsx`: add a `LessonViewTracker` client component.
- `app/lessons/[slug]/page.tsx`: render the tracker after canonical lesson context is resolved.
- `.posthog-events.json`: add the event to the temporary PostHog event manifest if it is still present.

## Requirements
1. Emit one `lesson:detail_view` event per rendered lesson-page instance.
2. Include canonical course/lesson slugs, one-based module/lesson indices, start source/second, and authenticated state.
3. Do not emit for missing lessons because `notFound()` runs before the tracker renders.
4. Do not add PII or user-authored content.
5. Analytics must remain a no-op when PostHog is not configured and must not affect rendering.
6. Preserve all existing local changes and analytics events.

## Acceptance criteria
- Opening a valid lesson emits `lesson:detail_view` with the documented properties.
- Refreshing or navigating to another lesson produces a new view event.
- React development effect replay does not duplicate the event for one mounted page instance.
- `npx tsc --noEmit` passes.
- ESLint passes for the touched lesson files.

## Manual test
1. Run `npm run dev` with PostHog configured.
2. Open a lesson with `?__posthog_debug=true`.
3. Confirm one `lesson:detail_view` event with the expected slugs, indices, start context, and authentication boolean.
4. Refresh and confirm one new event.
5. Navigate to another lesson and confirm its slugs and indices replace the previous values.
6. Open a search video-moment result and confirm `start_source` is `search` with the matched `start_second`.
7. Verify no title, description, URL, email, name, or IP property is present.
