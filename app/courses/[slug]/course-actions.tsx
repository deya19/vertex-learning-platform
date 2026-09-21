"use client";

import Link from "next/link";
import posthog from "posthog-js";

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

function DisabledContinueButton() {
  return (
    <button className="course-primary-action" type="button" disabled aria-disabled="true">
      Continue Learning <ArrowIcon />
    </button>
  );
}

type CourseActionsProps = {
  firstLessonSlug: string | undefined;
  courseSlug: string;
};

/**
 * Client component that owns the Continue Learning CTA and Bookmark button
 * on the course detail page. Extracted from the server component so that
 * click events can be captured with PostHog.
 */
export function CourseActions({ firstLessonSlug, courseSlug }: CourseActionsProps) {
  return (
    <div className="course-actions">
      {firstLessonSlug ? (
        <Link
          className="course-primary-action"
          href={`/lessons/${firstLessonSlug}`}
          onClick={() =>
            posthog.capture("course:continue_click", {
              course_slug: courseSlug,
              lesson_slug: firstLessonSlug,
              source: "hero",
            })
          }
        >
          Continue Learning <ArrowIcon />
        </Link>
      ) : (
        <DisabledContinueButton />
      )}
      <button
        className="course-bookmark"
        type="button"
        onClick={() =>
          posthog.capture("course:bookmark_click", {
            course_slug: courseSlug,
          })
        }
      >
        <BookmarkIcon />
        Bookmark
      </button>
    </div>
  );
}

type CourseSidebarActionsProps = {
  firstLessonSlug: string | undefined;
  courseSlug: string;
};

/**
 * Sidebar version of the Continue Learning CTA (used in the progress aside).
 */
export function CourseSidebarActions({ firstLessonSlug, courseSlug }: CourseSidebarActionsProps) {
  if (!firstLessonSlug) {
    return <DisabledContinueButton />;
  }

  return (
    <Link
      className="course-primary-action"
      href={`/lessons/${firstLessonSlug}`}
      onClick={() =>
        posthog.capture("course:continue_click", {
          course_slug: courseSlug,
          lesson_slug: firstLessonSlug,
          source: "sidebar",
        })
      }
    >
      Continue Learning <ArrowIcon />
    </Link>
  );
}
