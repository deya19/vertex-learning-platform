import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { PortableText } from "next-sanity";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLessonBySlug } from "../../../sanity/lib/data";
import { urlFor } from "../../../sanity/lib/image";
import { LessonNavigationLink, LessonResourceLink, LessonViewTracker } from "./lesson-actions";
import { LessonPlayer, LessonTabs } from "./lesson-player";
import { LessonModules } from "./lesson-modules";
import "./lesson.css";

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes}m`;
}

function Icon({ name }: { name: "bell" | "clock" | "level" | "students" | "bookmark" | "arrow" | "check" | "chevron" }) {
  const paths = {
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    level: <path d="M4 19v-3m5 3V9m5 10V5m5 14v-7" />,
    students: <><circle cx="9" cy="9" r="3" /><path d="M3 20c.4-3 2.4-5 6-5s5.6 2 6 5M16 7.5a3 3 0 0 1 0 5.7M18 15c1.8.7 2.8 2.3 3 5" /></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function getContext(lesson: Awaited<ReturnType<typeof getLessonBySlug>>) {
  const course = lesson?.course?.[0];
  if (!course) return null;
  for (const [moduleIndex, module] of course.modules.entries()) {
    const lessonIndex = module.lessons.findIndex((item) => item._id === lesson._id);
    if (lessonIndex >= 0) return { course, module, moduleIndex, lessonIndex };
  }
  return { course, module: course.modules[0], moduleIndex: 0, lessonIndex: 0 };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const lesson = await getLessonBySlug((await params).slug);
  return lesson ? { title: `${lesson.title} | Vertex`, description: lesson.title } : { title: "Lesson not found | Vertex" };
}

export default async function LessonPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ source?: string; start?: string }> }) {
  const lesson = await getLessonBySlug((await params).slug);
  if (!lesson) notFound();
  const context = getContext(lesson);
  if (!context) notFound();
  const { course, module, moduleIndex, lessonIndex } = context;
  const courseImage = course.coverImage ? urlFor(course.coverImage).width(140).height(140).fit("crop").url() : null;
  const { source, start } = await searchParams;
  const startValue = Number(start);
  const startSeconds = Number.isFinite(startValue) && startValue > 0 ? startValue : 0;
  const startSource = startSeconds === 0 ? "beginning" : source === "search" ? "search" : "direct_timestamp";
  const { isAuthenticated } = await auth();
  const previous = module.lessons[lessonIndex - 1] ?? course.modules[moduleIndex - 1]?.lessons.at(-1);
  const next = module.lessons[lessonIndex + 1] ?? course.modules[moduleIndex + 1]?.lessons[0];

  return (
    <main className="lesson-shell">
      <LessonViewTracker courseSlug={course.slug} isAuthenticated={isAuthenticated} lessonIndex={lessonIndex + 1} lessonSlug={lesson.slug} moduleIndex={moduleIndex + 1} startSecond={startSeconds} startSource={startSource} />
      <header className="course-header"><Link className="home-brand" href="/" aria-label="Vertex home"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></Link><nav className="home-nav" aria-label="Main navigation"><Link href="/courses">Courses</Link><Link href="/my-learning">My Learning</Link></nav><div className="home-actions"><button className="icon-button" type="button" aria-label="Notifications"><Icon name="bell" /></button>{isAuthenticated ? <UserButton /> : null}</div></header>
      <div className="lesson-layout">
        <aside className="lesson-sidebar">
          <Link className="lesson-back" href={`/courses/${course.slug}`}>← <span>Back to course</span></Link>
          <div className="lesson-course-card"><div className="lesson-course-mark">{courseImage ? <Image src={courseImage} alt={course.coverImage?.alt || `${course.title} cover`} fill sizes="70px" /> : "N"}</div><div><strong>{course.title}</strong><span>0% complete</span><i><b /></i></div></div>
          <div className="lesson-sidebar-heading">Module {moduleIndex + 1} of {course.modules.length}<Icon name="chevron" /></div>
          <LessonModules modules={course.modules} courseSlug={course.slug} currentModuleIndex={moduleIndex} currentLessonId={lesson._id} currentLessonSlug={lesson.slug} />
        </aside>
        <article className="lesson-main">
          <nav className="lesson-breadcrumbs" aria-label="Breadcrumb"><Link href="/courses">All Courses</Link><span>›</span><Link href={`/courses/${course.slug}`}>{course.title}</Link><span>›</span><span>{module.title}</span><span>›</span><span>{lesson.title}</span></nav>
          <div className="lesson-heading"><div><span className="lesson-eyebrow">Lesson {moduleIndex + 1}.{lessonIndex + 1}</span><h1>{lesson.title}</h1>{lesson.description ? <p>{lesson.description}</p> : null}</div><button className="lesson-bookmark" type="button" aria-label="Bookmark lesson"><Icon name="bookmark" /></button></div>
          <div className="lesson-meta"><span><Icon name="clock" />{formatDuration(lesson.duration)}</span><span><Icon name="level" />Intermediate</span><span><Icon name="students" />{lesson.studentCount?.toLocaleString() ?? 0} students</span></div>
          <LessonPlayer videoUrl={lesson.videoUrl} title={lesson.title} courseSlug={course.slug} lessonSlug={lesson.slug} durationSeconds={lesson.duration} startSeconds={startSeconds} startSource={startSource} />
          <LessonTabs courseSlug={course.slug} lessonSlug={lesson.slug} notes={<div className="lesson-notes">{lesson.notes?.length ? <PortableText value={lesson.notes as never[]} /> : <p>No notes have been added for this lesson yet.</p>}</div>}>
            {lesson.overview ? <section className="lesson-content-section"><h2>Overview</h2><p>{lesson.overview}</p></section> : null}
            {lesson.keyPoints?.length ? <section className="lesson-keypoints"><h3>In this lesson you will:</h3><ul>{lesson.keyPoints.map((point) => <li key={point}><Icon name="check" />{point}</li>)}</ul></section> : null}
            {lesson.proTip ? <aside className="lesson-protip"><strong>♧</strong><div><h3>Pro Tip</h3><p>{lesson.proTip}</p></div></aside> : null}
            {lesson.resources?.length ? <section className="lesson-resources"><h2>Resources</h2><div className="resource-grid">{lesson.resources.map((resource, resourceIndex) => <LessonResourceLink courseSlug={course.slug} href={resource.url} lessonSlug={lesson.slug} resourceIndex={resourceIndex + 1} resourceType={resource.type} key={resource._key}><span>♧</span><div><strong>{resource.title}</strong><p>{resource.description}</p></div><b>↗</b></LessonResourceLink>)}</div></section> : null}
          </LessonTabs>
        </article>
      </div>
      <footer className="lesson-footer"><div>{previous ? <LessonNavigationLink courseSlug={course.slug} currentLessonSlug={lesson.slug} href={`/lessons/${previous.slug}`} navigationSource="previous" targetLessonSlug={previous.slug}>← <span><b>Previous Lesson</b><small>{previous.title}</small></span></LessonNavigationLink> : <span />}</div>{next ? <LessonNavigationLink className="next-lesson" courseSlug={course.slug} currentLessonSlug={lesson.slug} href={`/lessons/${next.slug}`} navigationSource="next" targetLessonSlug={next.slug}><span><b>Next Lesson</b><small>{next.title}</small></span> →</LessonNavigationLink> : null}</footer>
    </main>
  );
}
