"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

/**
 * Identifies the authenticated Clerk user in PostHog so that
 * client-side and server-side events are correlated to a single person.
 * Rendered inside the root layout so it runs on every page load.
 */
export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();
  // Track whether the user was previously signed in so we only call
  // posthog.reset() on the signed-in → signed-out transition, never on
  // an initially-anonymous page load (which would discard the anonymous id).
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      wasSignedIn.current = true;
      posthog.identify(user.id);
    } else if (wasSignedIn.current) {
      // Only reset on explicit sign-out, not on an anonymous page load.
      posthog.reset();
      wasSignedIn.current = false;
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
