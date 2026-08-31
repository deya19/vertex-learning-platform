"use client";

import Link from "next/link";
import { useState } from "react";

type Lesson = {
  _id: string;
  slug: string;
  title: string;
  duration: number;
};

type Module = {
  _key: string;
  title: string;
  lessons: Lesson[];
};

type LessonModulesProps = {
  modules: Module[];
  currentModuleIndex: number;
  currentLessonId: string;
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes}m`;
}

export function LessonModules({ modules, currentModuleIndex, currentLessonId }: LessonModulesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(currentModuleIndex);

  return (
    <div className="lesson-modules">
      {modules.map((module, moduleIndex) => {
        const isExpanded = expandedIndex === moduleIndex;
        return (
          <section className={isExpanded ? "lesson-module expanded" : "lesson-module"} key={module._key}>
            <button
              className="module-row"
              type="button"
              aria-expanded={isExpanded}
              aria-controls={`module-lessons-${module._key}`}
              onClick={() => setExpandedIndex(isExpanded ? null : moduleIndex)}
            >
              <span className={moduleIndex === currentModuleIndex ? "module-number selected" : "module-number"}>{moduleIndex + 1}</span>
              <strong>{module.title}</strong>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
            </button>
            {isExpanded && (
              <div className="module-lessons" id={`module-lessons-${module._key}`}>
                {module.lessons.map((lesson) => (
                  <Link className={lesson._id === currentLessonId ? "module-lesson current" : "module-lesson"} href={`/lessons/${lesson.slug}`} key={lesson._id}>
                    <span className="lesson-dot" />
                    <span>
                      <b>{lesson.title}</b>
                      <small>{formatDuration(lesson.duration)}</small>
                      {lesson._id === currentLessonId && <em>Now playing</em>}
                    </span>
                    {lesson._id === currentLessonId && <span className="play-mark">▶</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
