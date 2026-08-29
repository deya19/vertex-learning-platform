"use client";

import { useState } from "react";
import Link from "next/link";

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

export function CourseContent({ modules }: { modules: CourseModule[] }) {
  const [showAll, setShowAll] = useState(false);
  const visibleModules = showAll ? modules : modules.slice(0, 6);
  return (
    <section className="course-content" aria-labelledby="course-content-title">
      <div className="course-section-heading">
        <h2 id="course-content-title">Course Content</h2>
        <p>
          {modules.length} modules <span aria-hidden="true">•</span> {formatDuration(modules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.duration, 0))}
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
                  <Link className="course-lesson" href={`/lessons/${lesson.slug}`} key={lesson._id}>
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
      {modules.length > 6 && (
        <button className="show-modules-button" type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll}>
          {showAll ? "Show fewer modules" : `Show all ${modules.length} modules`}
          <span aria-hidden="true">⌄</span>
        </button>
      )}
    </section>
  );
}
