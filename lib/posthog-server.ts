import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
          "this causes events to be silently missed. " +
          "This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
      );
    }
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(token, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function captureServerEvent({
  distinctId,
  event,
  properties,
}: {
  distinctId: string;
  event: string;
  properties?: Record<string, boolean | number | string | null>;
}) {
  const client = getPostHogClient();
  if (!client) return;

  try {
    client.capture({ distinctId, event, properties });
    await client.flush();
  } catch {
    console.error("PostHog server event delivery failed");
  }
}
