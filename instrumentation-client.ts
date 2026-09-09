import posthog, { type CaptureResult } from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// The browser can emit "ResizeObserver loop ..." on its own window error handler
// (mechanism.synthetic = true, no stack frames). No application code throws it, so
// drop it before it reaches Error Tracking and keep every other exception.
function dropBenignResizeObserverError(
  event: CaptureResult | null
): CaptureResult | null {
  if (event?.event === "$exception") {
    const exceptions = event.properties?.$exception_list as
      | { value?: string }[]
      | undefined;
    const isResizeObserverLoop = exceptions?.some((exception) =>
      exception.value?.includes("ResizeObserver loop")
    );
    if (isResizeObserverLoop) {
      return null;
    }
  }
  return event;
}

if (!token) {
  if (process.env.NODE_ENV === "development") {
    console.error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
        "this causes events to be silently missed. " +
        "This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
    );
  }
} else {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // Include the defaults option as required by PostHog
    defaults: "2026-01-30",
    // Enables capturing unhandled exceptions via Error Tracking
    capture_exceptions: true,
    // Drop benign browser-emitted noise before it reaches Error Tracking
    before_send: dropBenignResizeObserverError,
    // Turn on debug in development mode
    debug: process.env.NODE_ENV === "development",
  });
}

// IMPORTANT: Never combine this approach with other client-side PostHog initialization approaches,
// especially components like a PostHogProvider. instrumentation-client.ts is the correct solution
// for initializing client-side PostHog in Next.js 15.3+ apps.
