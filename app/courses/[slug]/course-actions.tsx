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

type CourseActionsProps = {
  firstLessonSlug: string | undefined;
  courseSlug: string;
  courseTitle: string;
};

/**
 * Client component that owns the Continue Learning CTA and Bookmark button
 * on the course detail page. Extracted from the server component so that
 * click events can be captured with PostHog.
 */
export function CourseActions({ firstLessonSlug, courseSlug, courseTitle }: CourseActionsProps) {
  const href = firstLessonSlug ? `/lessons/${firstLessonSlug}` : "#";

  return (
    <div className="course-actions">
      <Link
        className="course-primary-action"
        href={href}
        onClick={() =>
          posthog.capture("continue_learning_clicked", {
            course_slug: courseSlug,
            course_title: courseTitle,
            first_lesson_slug: firstLessonSlug ?? null,
          })
        }
      >
        Continue Learning <ArrowIcon />
      </Link>
      <button
        className="course-bookmark"
        type="button"
        onClick={() =>
          posthog.capture("course_bookmarked", {
            course_slug: courseSlug,
            course_title: courseTitle,
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
  courseTitle: string;
};

/**
 * Sidebar version of the Continue Learning CTA (used in the progress aside).
 */
export function CourseSidebarActions({ firstLessonSlug, courseSlug, courseTitle }: CourseSidebarActionsProps) {
  const href = firstLessonSlug ? `/lessons/${firstLessonSlug}` : "#";

  return (
    <Link
      className="course-primary-action"
      href={href}
      onClick={() =>
        posthog.capture("continue_learning_clicked", {
          course_slug: courseSlug,
          course_title: courseTitle,
          first_lesson_slug: firstLessonSlug ?? null,
          source: "sidebar",
        })
      }
    >
      Continue Learning <ArrowIcon />
    </Link>
  );
}
