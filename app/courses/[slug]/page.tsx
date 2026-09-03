import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseBySlug } from "../../../sanity/lib/data";
import { urlFor } from "../../../sanity/lib/image";
import { CourseContent } from "./course-content";
import { CourseActions, CourseSidebarActions } from "./course-actions";

function Icon({ name }: { name: "bell" | "level" | "clock" | "modules" | "students" | "bookmark" | "arrow" }) {
  const paths = {
    bell: <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
    level: <path d="M4 19v-3m5 3V9m5 10V5m5 14v-7" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    modules: <path d="M6 4h10l3 3v13H6V4Zm10 0v4h3M9 12h6m-6 3h6" />,
    students: <><circle cx="9" cy="9" r="3" /><path d="M3 20c.4-3 2.4-5 6-5s5.6 2 6 5M16 7.5a3 3 0 0 1 0 5.7M18 15c1.8.7 2.8 2.3 3 5" /></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes}m`;
}

function OutcomeIcon({ icon }: { icon: string }) {
  const iconPaths: Record<string, React.ReactNode> = {
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5" />,
    workflow: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    gauge: <path d="M4 18a8 8 0 1 1 16 0M12 14l3-4M12 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />,
    rocket: <path d="M14 4c3-1 6-1 6-1s0 3-1 6l-5 5-4-1-1-4 5-5ZM9 13l-4 1-2 4 4-2 2-3Zm2 2-1 4 3 2 1-4-3-2Z" />,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{iconPaths[icon] ?? iconPaths.layers}</svg>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  return course ? { title: `${course.title} | Vertex`, description: course.summary } : { title: "Course not found | Vertex" };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { isAuthenticated } = await auth();
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const lessons = course.modules.flatMap((module) => module.lessons);
  const totalDuration = lessons.reduce((total, lesson) => total + lesson.duration, 0);
  const coverImage = course.coverImage ? urlFor(course.coverImage).width(900).height(760).fit("crop").url() : null;

  return (
    <main className="course-shell">
      <header className="course-header">
        <Link className="home-brand" href="/" aria-label="Vertex home"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></Link>
        <nav className="home-nav" aria-label="Main navigation"><Link href="/courses">Courses</Link><Link href="/my-learning">My Learning</Link></nav>
        <div className="home-actions"><span className="icon-button" aria-hidden="true"><Icon name="bell" /></span>{isAuthenticated ? <UserButton /> : <div className="auth-actions"><SignInButton mode="modal"><button className="auth-link" type="button">Sign in</button></SignInButton><SignUpButton mode="modal"><button className="auth-signup" type="button">Sign up</button></SignUpButton></div>}</div>
      </header>

      <div className="course-page">
        <nav className="course-breadcrumbs" aria-label="Breadcrumb"><Link href="/courses">All Courses</Link><span aria-hidden="true">›</span><span>{course.title}</span></nav>
        <section className="course-hero" aria-labelledby="course-title">
          <div className="course-cover-wrap">{coverImage ? <Image className="course-cover" src={coverImage} alt={course.coverImage?.alt || `${course.title} cover`} fill priority sizes="(max-width: 800px) 100vw, 35vw" /> : <div className="course-cover-fallback">V</div>}</div>
          <div className="course-intro">
            {course.isPopular && <span className="popular-badge">Popular</span>}
            <h1 id="course-title">{course.title}</h1>
            <p className="course-summary">{course.summary}</p>
            <div className="course-meta-detail"><span><Icon name="level" />{course.level[0].toUpperCase() + course.level.slice(1)}</span><span><Icon name="clock" />{formatDuration(totalDuration)}</span><span><Icon name="modules" />{course.modules.length} modules</span><span><Icon name="students" />{course.studentCount?.toLocaleString() ?? 0} students</span></div>
            <CourseActions
              firstLessonSlug={lessons[0]?.slug}
              courseSlug={course.slug}
            />
          </div>
        </section>

        {course.learningOutcomes?.length ? <section className="learning-panel" aria-labelledby="learning-title"><h2 id="learning-title">What you’ll learn</h2><div className="outcome-grid">{course.learningOutcomes.map((outcome) => <article className="outcome-card" key={outcome._key}><OutcomeIcon icon={outcome.icon} /><div><h3>{outcome.title}</h3><p>{outcome.description}</p></div></article>)}</div></section> : null}
        <CourseContent courseSlug={course.slug} modules={course.modules} />
      </div>
      <aside className="progress-bar" aria-label="Your progress"><div><span>Your Progress</span><strong>0% complete</strong></div><div className="progress-track"><span /></div><CourseSidebarActions firstLessonSlug={lessons[0]?.slug} courseSlug={course.slug} /></aside>
    </main>
  );
}
