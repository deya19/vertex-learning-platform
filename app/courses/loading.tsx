export default function CoursesLoading() {
  return (
    <main className="home-shell courses-page-shell" aria-busy="true">
      <header className="home-header">
        <span className="home-brand"><span className="vertex-logo" aria-hidden="true">V</span><span>Vertex</span></span>
      </header>
      <section className="all-courses-content">
        <div className="course-loading" role="status">
          <span className="course-loading-spinner" aria-hidden="true" />
          <p>Loading courses…</p>
        </div>
      </section>
    </main>
  );
}
