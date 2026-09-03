"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

export function HeaderAuth() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) return <UserButton />;

  return (
    <div className="auth-actions">
      <SignInButton mode="modal">
        <button className="auth-link" type="button">Sign in</button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="auth-signup" type="button">Sign up</button>
      </SignUpButton>
    </div>
  );
}
