"use client";

import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";

type StartSource = "beginning" | "search" | "direct_timestamp";

type LessonPlayerProps = {
  videoUrl: string;
  title: string;
  courseSlug: string;
  lessonSlug: string;
  durationSeconds: number;
  startSeconds?: number;
  startSource: StartSource;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YouTubeEvent = { data: number };

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLIFrameElement,
        options: {
          playerVars?: Record<string, number | string>;
          events: { onReady: () => void; onStateChange: (event: YouTubeEvent) => void };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("YouTube player API timed out")), 10000);
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      resolve();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        youtubeApiPromise = null;
        reject(new Error("YouTube player API failed to load"));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

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

function UnavailablePlayer({ courseSlug, lessonSlug }: { courseSlug: string; lessonSlug: string }) {
  useEffect(() => {
    posthog.capture("video:embed_unavailable", {
      provider: "unsupported",
      course_slug: courseSlug,
      lesson_slug: lessonSlug,
    });
  }, [courseSlug, lessonSlug]);

  return <div className="lesson-video lesson-video-fallback">This video is not available for embedded playback.</div>;
}

export function LessonPlayer({
  videoUrl,
  title,
  courseSlug,
  lessonSlug,
  durationSeconds,
  startSeconds = 0,
  startSource,
}: LessonPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoId = getYouTubeId(videoUrl);

  useEffect(() => {
    if (!videoId || !iframeRef.current) return;

    let isMounted = true;
    let player: YouTubePlayer | null = null;
    let progressTimer: number | null = null;
    let hasPlayed = false;
    let hasCompleted = false;
    const reachedMilestones = new Set<number>();

    const stopProgressTimer = () => {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      progressTimer = null;
    };
    const captureProgress = () => {
      if (!player) return;
      const duration = player.getDuration() || durationSeconds;
      const position = Math.min(player.getCurrentTime(), duration);
      if (duration <= 0) return;
      const depth = (position / duration) * 100;
      for (const milestone of [25, 50, 75, 90, 100]) {
        if (depth >= milestone && !reachedMilestones.has(milestone)) {
          reachedMilestones.add(milestone);
          posthog.capture("video:watch_depth_reach", {
            provider: "youtube",
            course_slug: courseSlug,
            lesson_slug: lessonSlug,
            duration_seconds: Math.round(duration),
            position_seconds: Math.round(position),
            watch_depth_percent: milestone,
            start_source: startSource,
          });
        }
      }
    };
    const startProgressTimer = () => {
      if (progressTimer !== null) return;
      captureProgress();
      progressTimer = window.setInterval(captureProgress, 2000);
    };

    void loadYouTubeApi()
      .then(() => {
        if (!isMounted || !iframeRef.current || !window.YT?.Player) return;
        player = new window.YT.Player(iframeRef.current, {
          playerVars: {
            rel: 0,
            modestbranding: 1,
            ...(startSeconds > 0 ? { start: Math.floor(startSeconds) } : {}),
          },
          events: {
            onReady: () => {
              // The IFrame API takeover of the existing iframe does not
              // guarantee playerVars are re-applied, so seek explicitly.
              if (startSeconds > 0) player?.seekTo(Math.floor(startSeconds), true);
              captureProgress();
            },
            onStateChange: (event) => {
              if (event.data === 1) {
                if (!hasPlayed) {
                  hasPlayed = true;
                  posthog.capture("video:play", {
                    provider: "youtube",
                    course_slug: courseSlug,
                    lesson_slug: lessonSlug,
                    duration_seconds: Math.round(player?.getDuration() || durationSeconds),
                    start_second: Math.floor(startSeconds),
                    start_source: startSource,
                  });
                }
                startProgressTimer();
              } else if (event.data === 0) {
                captureProgress();
                stopProgressTimer();
                if (!hasCompleted) {
                  hasCompleted = true;
                  posthog.capture("lesson:complete", {
                    provider: "youtube",
                    course_slug: courseSlug,
                    lesson_slug: lessonSlug,
                    duration_seconds: Math.round(player?.getDuration() || durationSeconds),
                  });
                }
              } else if (event.data === 2) {
                captureProgress();
                stopProgressTimer();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!isMounted) return;
        posthog.capture("video:embed_unavailable", {
          provider: "youtube",
          course_slug: courseSlug,
          lesson_slug: lessonSlug,
        });
      });

    return () => {
      isMounted = false;
      stopProgressTimer();
      player?.destroy();
    };
  }, [courseSlug, durationSeconds, lessonSlug, startSeconds, startSource, videoId]);

  if (!videoId) return <UnavailablePlayer courseSlug={courseSlug} lessonSlug={lessonSlug} />;

  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
  });
  if (startSeconds > 0) params.set("start", String(Math.floor(startSeconds)));

  return (
    <div className="lesson-video">
      <iframe
        ref={iframeRef}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

export function LessonTabs({
  children,
  notes,
  courseSlug,
  lessonSlug,
}: {
  children: React.ReactNode;
  notes: React.ReactNode;
  courseSlug: string;
  lessonSlug: string;
}) {
  const [tab, setTab] = useState<"content" | "notes">("content");
  const selectTab = (nextTab: typeof tab) => {
    setTab(nextTab);
    if (nextTab !== tab) {
      posthog.capture("lesson:tab_select", {
        course_slug: courseSlug,
        lesson_slug: lessonSlug,
        tab_name: nextTab,
      });
    }
  };

  return (
    <>
      <div className="lesson-tabs" role="tablist" aria-label="Lesson details">
        <button className={tab === "content" ? "active" : ""} role="tab" aria-selected={tab === "content"} onClick={() => selectTab("content")} type="button">Lesson Content</button>
        <button className={tab === "notes" ? "active" : ""} role="tab" aria-selected={tab === "notes"} onClick={() => selectTab("notes")} type="button">Notes</button>
      </div>
      <div className="lesson-tab-panel">{tab === "content" ? children : notes}</div>
    </>
  );
}
