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
          events: {
            onReady: () => void;
            onStateChange: (event: YouTubeEvent) => void;
            onError: (event: YouTubeEvent) => void;
          };
        },
      ) => YouTubePlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Watch depth milestones. The first one sits below 25% so that a video that
// starts but stalls almost immediately still records some progress. When a
// lesson logs video:play but no milestone, the player never advanced at all.
const WATCH_DEPTH_MILESTONES = [10, 25, 50, 75, 90, 100];

// A player reporting "playing" while its position does not move is stuck.
// After this many progress ticks (2s each) with no advance, flag the stall.
const STALL_TICK_LIMIT = 5;

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
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!videoId || !iframeRef.current) return;

    let isMounted = true;
    let player: YouTubePlayer | null = null;
    let progressTimer: number | null = null;
    let hasPlayed = false;
    let hasCompleted = false;
    let failed = false;
    // Watchdog state: the last position we saw and how many ticks in a row
    // the player has not moved past it while it claims to be playing.
    let lastWatchdogPosition = -1;
    let stalledTicks = 0;
    const reachedMilestones = new Set<number>();

    const stopProgressTimer = () => {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      progressTimer = null;
    };
    const failPlayback = (reason: string, extra: Record<string, number | string> = {}) => {
      if (failed) return;
      failed = true;
      stopProgressTimer();
      posthog.capture("video:embed_unavailable", {
        provider: "youtube",
        course_slug: courseSlug,
        lesson_slug: lessonSlug,
        failure_reason: reason,
        ...extra,
      });
      if (isMounted) setUnavailable(true);
    };
    const currentPosition = () => {
      if (!player) return null;
      const duration = player.getDuration() || durationSeconds;
      if (duration <= 0) return null;
      const position = Math.min(player.getCurrentTime(), duration);
      return { position, duration };
    };
    const captureProgress = () => {
      const state = currentPosition();
      if (!state) return;
      const depth = (state.position / state.duration) * 100;
      for (const milestone of WATCH_DEPTH_MILESTONES) {
        if (depth >= milestone && !reachedMilestones.has(milestone)) {
          reachedMilestones.add(milestone);
          posthog.capture("video:watch_depth_reach", {
            provider: "youtube",
            course_slug: courseSlug,
            lesson_slug: lessonSlug,
            duration_seconds: Math.round(state.duration),
            position_seconds: Math.round(state.position),
            watch_depth_percent: milestone,
            start_source: startSource,
          });
        }
      }
    };
    const monitorTick = () => {
      captureProgress();
      const state = currentPosition();
      if (!state || failed) return;
      // The position advances while the player really plays. If it does not
      // move across STALL_TICK_LIMIT ticks, the player is stuck.
      if (lastWatchdogPosition >= 0 && state.position - lastWatchdogPosition < 0.25) {
        stalledTicks += 1;
        if (stalledTicks >= STALL_TICK_LIMIT) {
          failPlayback("playback_stalled", {
            position_seconds: Math.round(state.position),
            duration_seconds: Math.round(state.duration),
          });
        }
      } else {
        stalledTicks = 0;
      }
      lastWatchdogPosition = state.position;
    };
    const startProgressTimer = () => {
      if (progressTimer !== null) return;
      captureProgress();
      progressTimer = window.setInterval(monitorTick, 2000);
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
                // Reset the watchdog so a pause, resume, or seek does not
                // carry a stale non-advancing count into the next play.
                stalledTicks = 0;
                lastWatchdogPosition = -1;
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
              } else if (event.data === 3) {
                // Buffering is a legitimate pause in progress, so do not let
                // it accumulate toward a false stall.
                stalledTicks = 0;
                lastWatchdogPosition = -1;
              }
            },
            onError: (event) => {
              // A YouTube error (removed video, or embedding blocked by the
              // channel) leaves a black frame with an endless spinner. Show
              // the fallback and record why instead.
              failPlayback("player_error", { error_code: event.data });
            },
          },
        });
      })
      .catch(() => {
        if (!isMounted) return;
        // The API script itself failed to load. The plain iframe can still
        // play, so keep it and only record that tracking is unavailable.
        posthog.capture("video:embed_unavailable", {
          provider: "youtube",
          course_slug: courseSlug,
          lesson_slug: lessonSlug,
          failure_reason: "api_load_failed",
        });
      });

    return () => {
      isMounted = false;
      stopProgressTimer();
      player?.destroy();
    };
  }, [courseSlug, durationSeconds, lessonSlug, startSeconds, startSource, videoId]);

  if (!videoId) return <UnavailablePlayer courseSlug={courseSlug} lessonSlug={lessonSlug} />;
  if (unavailable) {
    return <div className="lesson-video lesson-video-fallback">This video cannot play right now. Try again later or pick another lesson.</div>;
  }

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
