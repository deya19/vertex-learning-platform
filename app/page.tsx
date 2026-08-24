import Link from "next/link";

type IconName = "bell" | "search" | "arrow" | "level" | "clock" | "modules" | "star";

type Course = {
  title: string;
  description: string;
  level: string;
  duration: string;
  modules: string;
  mark: "next" | "docker" | "typescript";
};

const courses: Course[] = [
  {
    title: "Next.js for Production",
    description: "Build scalable, high-performance web applications with Next.js.",
    level: "Intermediate",
    duration: "18h 24m",
    modules: "12 modules",
    mark: "next",
  },
  {
    title: "Docker Essentials",
    description: "Containerize applications and streamline your development workflow.",
    level: "Beginner",
    duration: "10h 12m",
    modules: "8 modules",
    mark: "docker",
  },
  {
    title: "TypeScript Deep Dive",
    description: "Go beyond the basics and write safer, more expressive code.",
    level: "Intermediate",
    duration: "14h 36m",
    modules: "10 modules",
    mark: "typescript",
  },
];

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

function CourseMark({ mark }: { mark: Course["mark"] }) {
  if (mark === "next") return <div className="course-mark mark-next">N</div>;
  if (mark === "typescript") return <div className="course-mark mark-typescript">TS</div>;

  return (
    <div className="course-mark mark-docker" aria-label="Docker">
      <span className="docker-whale"><i /><i /><i /><i /><i /><i /><b /></span>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <article className="home-course-card">
      <CourseMark mark={course.mark} />
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="course-meta">
        <span><Icon name="level" />{course.level}</span>
        <span><Icon name="clock" />{course.duration}</span>
        <span><Icon name="modules" />{course.modules}</span>
      </div>
    </article>
  );
}

export default function Home() {
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
          <button className="icon-button" type="button" aria-label="Notifications"><Icon name="bell" /></button>
          <div className="avatar" aria-label="User profile">A</div>
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
          {courses.map((course) => <CourseCard course={course} key={course.title} />)}
        </div>
        <div className="weekly-note"><span /><div><Icon name="star" /> <span>New courses and lessons added every week.</span></div><span /></div>
        <div className="growth-bars" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
        </div>
      </section>
    </main>
  );
}
