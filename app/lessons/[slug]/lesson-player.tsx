"use client";

import { useState } from "react";

type LessonPlayerProps = {
  videoUrl: string;
  title: string;
  startSeconds?: number;
};

function getYouTubeId(videoUrl: string) {
  try {
    const url = new URL(videoUrl);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") {
      return url.searchParams.get("v") || (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null);
    }
  } catch {
    return null;
  }
  return null;
}

export function LessonPlayer({ videoUrl, title, startSeconds = 0 }: LessonPlayerProps) {
  const videoId = getYouTubeId(videoUrl);
  if (!videoId) {
    return <div className="lesson-video lesson-video-fallback">This video is not available for embedded playback.</div>;
  }

  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
  if (startSeconds > 0) params.set("start", String(Math.floor(startSeconds)));

  return (
    <div className="lesson-video">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

export function LessonTabs({ children, notes }: { children: React.ReactNode; notes: React.ReactNode }) {
  const [tab, setTab] = useState<"content" | "notes">("content");
  return (
    <>
      <div className="lesson-tabs" role="tablist" aria-label="Lesson details">
        <button className={tab === "content" ? "active" : ""} role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")} type="button">Lesson Content</button>
        <button className={tab === "notes" ? "active" : ""} role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")} type="button">Notes</button>
      </div>
      <div className="lesson-tab-panel">{tab === "content" ? children : notes}</div>
    </>
  );
}
