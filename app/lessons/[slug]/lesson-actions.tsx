"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

export function LessonViewTracker({
  courseSlug,
  isAuthenticated,
  lessonIndex,
  lessonSlug,
  moduleIndex,
  startSecond,
  startSource,
}: {
  courseSlug: string;
  isAuthenticated: boolean;
  lessonIndex: number;
  lessonSlug: string;
  moduleIndex: number;
  startSecond: number;
  startSource: "beginning" | "search" | "direct_timestamp";
}) {
  const capturedView = useRef("");

  useEffect(() => {
    const viewKey = `${courseSlug}:${lessonSlug}:${startSecond}:${startSource}`;
    if (capturedView.current === viewKey) return;
    capturedView.current = viewKey;
    posthog.capture("lesson:detail_view", {
      course_slug: courseSlug,
      lesson_slug: lessonSlug,
      module_index: moduleIndex,
      lesson_index: lessonIndex,
      start_second: startSecond,
      start_source: startSource,
      is_authenticated: isAuthenticated,
    });
  }, [courseSlug, isAuthenticated, lessonIndex, lessonSlug, moduleIndex, startSecond, startSource]);

  return null;
}

export function LessonNavigationLink({
  children,
  className,
  courseSlug,
  currentLessonSlug,
  href,
  navigationSource,
  targetLessonSlug,
}: {
  children: React.ReactNode;
  className?: string;
  courseSlug: string;
  currentLessonSlug: string;
  href: string;
  navigationSource: "module_list" | "previous" | "next";
  targetLessonSlug: string;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => posthog.capture("lesson:navigation_click", {
        course_slug: courseSlug,
        lesson_slug: currentLessonSlug,
        target_lesson_slug: targetLessonSlug,
        navigation_source: navigationSource,
      })}
    >
      {children}
    </Link>
  );
}

export function LessonResourceLink({
  children,
  courseSlug,
  href,
  lessonSlug,
  resourceIndex,
  resourceType,
}: {
  children: React.ReactNode;
  courseSlug: string;
  href: string;
  lessonSlug: string;
  resourceIndex: number;
  resourceType: string;
}) {
  return (
    <a
      className="resource-card"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={() => posthog.capture("lesson:resource_open", {
        course_slug: courseSlug,
        lesson_slug: lessonSlug,
        resource_type: resourceType,
        resource_index: resourceIndex,
      })}
    >
      {children}
    </a>
  );
}
