"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";

type Lesson = {
  _id: string;
  title: string;
  slug: string;
  duration: number;
  isFreePreview?: boolean;
};

type CourseModule = {
  _key: string;
  title: string;
  summary: string;
  lessons: Lesson[];
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m`;
}

export function CourseContent({
  courseSlug,
  modules,
  rawModuleCount,
}: {
  courseSlug: string;
  modules: CourseModule[];
  rawModuleCount?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const safeModules = modules
    .map((module) => ({ ...module, lessons: (module.lessons ?? []).filter(Boolean) }))
    .filter((module) => module.lessons.length > 0);
  const hasLessons = safeModules.length > 0;

  useEffect(() => {
    if (!hasLessons) {
      posthog.capture("course:curriculum_empty", {
        course_slug: courseSlug,
        module_count: rawModuleCount ?? modules.length,
      });
    }
  }, [hasLessons, courseSlug, rawModuleCount, modules.length]);

  if (!hasLessons) {
    return (
      <section className="course-content" aria-labelledby="course-content-title">
        <div className="course-section-heading">
          <h2 id="course-content-title">Course Content</h2>
        </div>
        <div className="course-content-empty">
          <h3>Lessons are on the way</h3>
          <p>This course does not have any lessons ready yet. Explore the rest of the catalog while we finish it.</p>
          <Link className="course-primary-action" href="/courses">Browse all courses</Link>
        </div>
      </section>
    );
  }

  const visibleModules = showAll ? safeModules : safeModules.slice(0, 6);
  return (
    <section className="course-content" aria-labelledby="course-content-title">
      <div className="course-section-heading">
        <h2 id="course-content-title">Course Content</h2>
        <p>
          {safeModules.length} modules <span aria-hidden="true">•</span> {formatDuration(safeModules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.duration, 0))}
        </p>
      </div>
      <div className="module-list">
        {visibleModules.map((module, moduleIndex) => (
          <div className="module-block" key={module._key}>
            <div className="module-heading">
              <span className="module-number">{moduleIndex + 1}</span>
              <div>
                <p className="module-label">Module {moduleIndex + 1}</p>
                <h3>{module.title}</h3>
                <p>{module.summary}</p>
              </div>
            </div>
            <div className="lesson-list">
              {module.lessons.map((lesson, lessonIndex) => (
                  <Link
                    className="course-lesson"
                    href={`/lessons/${lesson.slug}`}
                    key={lesson._id}
                    onClick={() =>
                      posthog.capture("course:lesson_open", {
                        course_slug: courseSlug,
                        lesson_slug: lesson.slug,
                        module_index: moduleIndex + 1,
                        lesson_index: lessonIndex + 1,
                        is_free_preview: lesson.isFreePreview ?? false,
                      })
                    }
                  >
                    <span className="lesson-index">{moduleIndex + 1}.{lessonIndex + 1}</span>
                    <span className="lesson-copy">
                      <strong>{lesson.title}</strong>
                      <small>{lesson.isFreePreview ? "Free preview" : "Watch this lesson at your own pace."}</small>
                    </span>
                    <span className="lesson-duration">{formatDuration(lesson.duration)}</span>
                    <span className="lesson-chevron" aria-hidden="true">⌄</span>
                  </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      {safeModules.length > 6 && (
        <button
          className="show-modules-button"
          type="button"
          onClick={() => {
            const next = !showAll;
            setShowAll(next);
            if (next) {
              posthog.capture("course:module_expand", {
                course_slug: courseSlug,
                module_count: safeModules.length,
                source: "course_content",
              });
            }
          }}
          aria-expanded={showAll}
        >
          {showAll ? "Show fewer modules" : `Show all ${safeModules.length} modules`}
          <span aria-hidden="true">⌄</span>
        </button>
      )}
    </section>
  );
}
