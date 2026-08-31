import Link from "next/link";
import { HeaderAuth } from "./HeaderAuth";

/**
 * Shared site header: brand, primary nav, notification bell, and the auth
 * control. Pages pass `className` to switch between the home and course header
 * variants.
 */
export function SiteHeader({ className = "home-header" }: { className?: string }) {
  return (
    <header className={className}>
      <Link className="home-brand" href="/" aria-label="Vertex home">
        <span className="vertex-logo" aria-hidden="true">V</span>
        <span>Vertex</span>
      </Link>
      <nav className="home-nav" aria-label="Main navigation">
        <Link href="/courses">Courses</Link>
        <Link href="/my-learning">My Learning</Link>
      </nav>
      <div className="home-actions">
        <span className="icon-button" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
        </span>
        <HeaderAuth />
      </div>
    </header>
  );
}
