"use client";

import {
  ClerkLoading,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

/**
 * Header auth control, resolved from Clerk's client session. `Show` renders
 * nothing until the session loads, so a signed-in visitor never sees the
 * signed-out buttons or clicks a dead one (which would call `openSignIn` and
 * throw in single-session mode). `ClerkLoading` holds the slot meanwhile.
 */
export function HeaderAuth() {
  return (
    <>
      <ClerkLoading>
        <span className="auth-actions-placeholder" aria-hidden="true" />
      </ClerkLoading>
      <Show when="signed-out">
        <div className="auth-actions">
          <SignInButton mode="modal">
            <button className="auth-link" type="button">Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="auth-signup" type="button">Sign up</button>
          </SignUpButton>
        </div>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
