import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { getCourses } from "../sanity/lib/data";
import { urlFor } from "../sanity/lib/image";
import type { Course } from "../sanity/lib/data";

type IconName = "bell" | "search" | "arrow" | "level" | "clock" | "modules" | "star";

function Icon({ name }: { name: IconName }) {
  if (name === "arrow") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
  }

  if (name === "star") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>;
  }

  if (name === "search") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 5 5" /></svg>;
  }

  if (name === "bell") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>;
  }

  if (name === "level") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19v-3m5 3V9m5 10V5m5 14v-7" /></svg>;
  }

  if (name === "clock") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h10l3 3v13H6V4Zm10 0v4h3M9 12h6m-6 3h6" /></svg>;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes}m`;
}

function CourseCard({ course }: { course: Course }) {
  const duration = course.modules.flatMap((module) => module.lessons).reduce((total, lesson) => total + lesson.duration, 0);
  const coverImage = course.coverImage ? urlFor(course.coverImage).width(240).height(160).fit("crop").url() : null;

  return (
    <Link className="home-course-card" href={`/courses/${course.slug}`}>
      <div className="course-card-art">{coverImage ? <Image src={coverImage} alt={course.coverImage?.alt || `${course.title} cover`} fill sizes="(max-width: 700px) 100vw, 30vw" /> : <span>V</span>}</div>
      <h3>{course.title}</h3>
      <p>{course.summary}</p>
      <div className="course-meta">
        <span><Icon name="level" />{course.level[0].toUpperCase() + course.level.slice(1)}</span>
        <span><Icon name="clock" />{formatDuration(duration)}</span>
        <span><Icon name="modules" />{course.modules.length} modules</span>
      </div>
    </Link>
  );
}

export default async function Home() {
  const courses = await getCourses();
  const featuredCourses = courses.slice(-3);

  return (
    <main className="home-shell">
      <header className="home-header">
        <Link className="home-brand" href="/" aria-label="Vertex home">
          <span className="vertex-logo" aria-hidden="true">V</span>
          <span>Vertex</span>
        </Link>
        <nav className="home-nav" aria-label="Main navigation">
          <Link href="/courses">Courses</Link>
          <Link href="/my-learning">My Learning</Link>
        </nav>
        <div className="home-actions">
          <span className="icon-button" aria-hidden="true"><Icon name="bell" /></span>
          <Show when="signed-out">
            <div className="auth-actions">
              <SignInButton mode="modal">
                <button className="auth-link" type="button">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="auth-signup" type="button">Sign up</button>
              </SignUpButton>
            </div>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="eyebrow">Intelligent learning</div>
        <h1 id="hero-title">Search your learning<br />in plain English.</h1>
        <p className="hero-copy">Vertex understands what you want to learn and<br className="desktop-break" /> finds the exact lessons across all your courses.</p>
        <Link className="primary-cta" href="/courses">Explore Courses <Icon name="arrow" /></Link>
        <div className="search-box" role="search">
          <Icon name="search" />
          <span>Ask anything about your learning...</span>
          <kbd>⌘ K</kbd>
        </div>
      </section>

      <section className="courses-section" aria-labelledby="courses-title">
        <div className="section-heading">
          <h2 id="courses-title">All Courses</h2>
          <Link href="/courses">View all courses <Icon name="arrow" /></Link>
        </div>
        <div className="course-grid">
          {featuredCourses.map((course) => <CourseCard course={course} key={course.title} />)}
        </div>
        <div className="weekly-note"><span /><div><Icon name="star" /> <span>New courses and lessons added every week.</span></div><span /></div>
        <div className="growth-bars" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
      </section>
    </main>
  );
}
