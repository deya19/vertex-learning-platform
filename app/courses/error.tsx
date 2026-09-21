"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <main className="home-shell courses-page-shell">
      <header className="home-header">
        <Link className="home-brand" href="/" aria-label="Vertex home"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></Link>
      </header>
      <section className="all-courses-content">
        <div className="course-error" role="alert">
          <h1>We couldn’t load this course</h1>
          <p>Something went wrong while loading the content. Please try again.</p>
          <div className="course-error-actions">
            <button className="course-primary-action" type="button" onClick={() => reset()}>Try again</button>
            <Link className="course-bookmark" href="/courses">Back to all courses</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
