import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getCourses } from "../../sanity/lib/data";
import type { Course } from "../../sanity/lib/data";
import { urlFor } from "../../sanity/lib/image";

type IconName = "arrow" | "level" | "clock" | "modules";

function Icon({ name }: { name: IconName }) {
  const paths = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    level: <path d="M4 19v-3m5 3V9m5 10V5m5 14v-7" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    modules: <path d="M6 4h10l3 3v13H6V4Zm10 0v4h3M9 12h6m-6 3h6" />,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
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
      <h2>{course.title}</h2>
      <p>{course.summary}</p>
      <div className="course-meta">
        <span><Icon name="level" />{course.level[0].toUpperCase() + course.level.slice(1)}</span>
        <span><Icon name="clock" />{formatDuration(duration)}</span>
        <span><Icon name="modules" />{course.modules.length} modules</span>
      </div>
    </Link>
  );
}

export default async function CoursesPage() {
  const courses = await getCourses();

  return (
    <main className="home-shell courses-page-shell">
      <SiteHeader />
      <section className="all-courses-content" aria-labelledby="all-courses-title">
        <div className="all-courses-heading"><div><p className="eyebrow">Learn at your pace</p><h1 id="all-courses-title">All Courses</h1><p>Explore the full Vertex curriculum and find your next skill to build.</p></div><Link href="/" className="all-courses-back">Back home <Icon name="arrow" /></Link></div>
        <div className="course-grid">{courses.map((course) => <CourseCard course={course} key={course._id} />)}</div>
      </section>
    </main>
  );
}
