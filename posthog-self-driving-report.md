# PostHog Self-driving Setup Report

## Summary

PostHog Self-driving has been configured for Vertex: Session Replay, Error Tracking, and Support are enabled, six signal sources are wired to the inbox, a five-scout troop (four built-in + one custom) is watching product analytics, web traffic, anomalies, and learner engagement, and two Replay Vision monitors are scanning course and lesson page recordings for breakage and frustration. Findings will start appearing in the [Self-driving inbox](https://us.posthog.com/project/585154/inbox) within ~30 minutes of the first scout run.

---

## AI data processing

**Status:** Approved (organization-level AI consent was granted before this run started).

---

## GitHub

**Status:** Connected during this run.

- Integration ID: `259625`
- GitHub account: `deya19`
- Connected: 2026-08-30

Self-driving can now research findings against your repository and open draft fixes.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **enabled** | Server toggle flipped ON. `posthog-js` init has no `disable_session_recording` override — clean. |
| Error Tracking | **enabled** | Server toggle flipped ON. `instrumentation-client.ts` already sets `capture_exceptions: true` — no init change needed. |
| Support (Conversations) | **enabled** | Server toggle flipped ON. **Tickets will not arrive until an inbound channel is connected** — see Follow-ups. |

---

## Signal sources

| source_product | source_type | Action |
|---|---|---|
| `signals_scout` | `cross_source_issue` | **Skipped** — ON by default, no config row required |
| `health_checks` | `health_issue` | **Enabled** (id: `01a05276-2c97-7879-9aa9-f2716b6a3885`) |
| `error_tracking` | `issue_created` | **Enabled** (id: `01a05276-321c-7cb3-9379-a144e4da24da`) |
| `error_tracking` | `issue_reopened` | **Enabled** (id: `01a05276-34fe-7453-b840-f47e0c6449ab`) |
| `error_tracking` | `issue_spiking` | **Enabled** (id: `01a05276-3a39-71d6-a514-8097e6137196`) |
| `session_replay` | `session_analysis_cluster` | **Enabled** (id: `01a05276-3f72-79fc-955a-5ccb0fb2c151`, sample rate: 10%) |
| `conversations` | `ticket` | **Enabled** (id: `01a05276-4510-736f-b8c0-2c29509cb369`) — dormant until a channel is connected |
| `replay_vision` | — | **Skipped** — Replay Vision scanners are self-authorizing via `emits_signals: true`; no config row needed |
| `llm_analytics` | — | **Skipped** — no `$ai_*` events or LLM SDK in use yet |
| `logs` | — | **Skipped** — PostHog logs product not in use |

---

## Connected tools

No external tools were selected. All connected-tool sources skipped (not used).

---

## Scout troop

**Run budget:** 100 runs/day (early access default, confirmed via `scout-metadata-get`). 0 runs used today, 100 remaining.

**Banner:** _"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."_

### Enabled (5 total)

| Scout | What it watches |
|---|---|
| `signals-scout-general` | Cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | Funnels, retention, lifecycle, and stickiness regressions in saved flows |
| `signals-scout-web-analytics` | Per-channel session volume, attribution breakage, and landing-page health |
| `signals-scout-anomaly-detection` | Bursts, drops, flat-lines, and trend breaks in saved dashboards and insights |
| `signals-scout-learner-engagement` | _(custom)_ Lesson-click rate vs. course page views — see Custom scouts |

### Disabled (22)

| Scout | Reason disabled |
|---|---|
| `signals-scout-error-tracking` | Covered by native source (`error_tracking` responders) — intentional, not a re-enable follow-up |
| `signals-scout-session-replay` | Covered by native source (`session_replay` responder) — intentional, not a re-enable follow-up |
| `signals-scout-feature-flags` | No feature flags in use yet — enable in PostHog if you add flags |
| `signals-scout-experiments` | No A/B experiments yet — enable if you run experiments |
| `signals-scout-surveys` | No surveys in use — enable if you add surveys |
| `signals-scout-revenue-analytics` | No payment SDK or revenue events — enable when Stripe/billing is integrated |
| `signals-scout-ai-observability` | No `$ai_*` events yet — enable once the AI search feature is instrumented |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-csp-violations` | No Content Security Policy reporting configured |
| `signals-scout-customer-analytics` | No group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations, batch exports, or hog flows |
| `signals-scout-data-warehouse` | No warehouse sources connected |
| `signals-scout-replay-vision` | No prior Replay Vision observations to trend over yet |
| `signals-scout-conversations` | Conversations product just enabled, no ticket data yet |
| `signals-scout-apm` | No distributed tracing / OpenTelemetry spans |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry |
| `signals-scout-inbox-validation` | Fresh setup — no shipped fixes to validate yet |
| `signals-scout-insight-alerts` | No insight alerts configured |
| `signals-scout-observability-gaps` | Fresh setup; left room for custom scout |
| `signals-scout-health-checks` | Health issues surface via the native `health_checks` source |
| `signals-scout-skills-store` | No skill-hygiene need |
| `signals-scout-tasks` | No PostHog tasks running yet |

---

## Custom scouts

### Created: `signals-scout-learner-engagement`

- **Surface:** The learner engagement funnel — `lesson_clicked` and `continue_learning_clicked` events relative to course page views (`$pageview` on `/courses/*`).
- **Discriminator:** `lesson_clicked / course_pageviews` ratio in the last 7 days drops ≥ 15% vs. the prior 7 days, while course page views are NOT also down ≥ 15% (which would indicate a traffic drop, not a funnel problem).
- **Why no built-in covers it:** `signals-scout-product-analytics` only watches *saved* funnel insights — this project has none yet. `signals-scout-web-analytics` watches sessions and attribution, not the learner domain funnel. `signals-scout-anomaly-detection` needs saved dashboards. `signals-scout-general` sweeps cross-product but doesn't know the learner domain vocabulary.
- **Explore patterns:** (1) per-course lesson-click breakdown, (2) Continue Learning CTA delta, (3) free-preview vs. gated lesson split to detect auth-gating regressions.
- **Disqualifiers:** fewer than 10 `lesson_clicked` events in either window; drop < 10%; course views also fell; drop confined to a single day.

### Surfaces considered and ruled out

| Surface | Filter that killed it |
|---|---|
| Search quality (`search_performed`) | Not watchable — search feature not yet built, no events in code |
| Lesson completion (`lesson_completed`) | Not watchable — event not yet captured in code |
| Video playback (`video_play`, `video_watched_pct`) | Not watchable — no video events in code yet |
| Auth conversion (sign-in → lesson access) | Not clearly watchable with current events; too thin to discriminate |

### Noise escape hatch

If `signals-scout-learner-engagement` turns out noisy, set `emit: false` on its config in PostHog ([inbox config page](https://us.posthog.com/project/585154/inbox)) to switch it to dry-run mode — it keeps running and logging but stops writing to the inbox.

---

## Replay Vision scanners

Replay Vision scanners are LLMs that watch **individual session recordings** on a schedule. Each scanner sees the full recording — mouse movement, clicks, page content — and flags what no event can capture: blank screens, broken layouts, silent failures, and visible user struggle. Findings are emitted at half weight, so they need corroboration from a second observation before being promoted into an inbox report.

No recordings exist yet on this project; the scanners are armed and will start working the day recordings begin (once learners visit the live site with PostHog initialized).

### Created: Course and lesson breakage

- **Scanner ID:** `01a05287-1219-7912-804e-0ab070c3a1a4`
- **Type:** Monitor (`emits_signals: true`)
- **What it watches:** Sessions that visited a course detail page (`/courses/*`) or lesson page (`/lessons/*`).
- **Query scope:** HogQL filter — `like(properties.$current_url, '%/courses/%') OR like(properties.$current_url, '%/lessons/%')` — chosen because these are Vertex's most critical learning pages and where breakage costs the most.
- **Failure modes flagged:** missing curriculum, "Continue Learning" linking to `#`, blank lesson page, auth-gating breakage, video embed not loading, module expansion stall.
- **Sampling rate:** 50%
- **Estimated monthly credits:** 0 (no recordings yet)

### Created: Learner rage clicks

- **Scanner ID:** `01a05287-27bb-7331-b840-bb41df18ea75`
- **Type:** Monitor (`emits_signals: true`)
- **What it watches:** Any session containing a `$rageclick` event (covers the whole site).
- **Stuck moments flagged:** hammering "Continue Learning" CTA, repeated lesson link clicks during a stall, Bookmark button with no confirmation, "Show all modules" not expanding, free preview label clicked expecting video, auth prompt not loading.
- **Sampling rate:** 100% of rage-click sessions
- **Estimated monthly credits:** 0 (no recordings yet)

---

## Follow-ups

- [ ] **Connect a Conversations inbound channel** so support tickets reach the inbox. Go to [Integrations settings](https://us.posthog.com/project/585154/settings/environment-integrations) and connect email, inbox, or Slack to the Support product.
- [ ] **Enable `signals-scout-ai-observability`** once the AI search feature is built and `$ai_*` events are flowing from the LLM/Sanity Context MCP integration.
- [ ] **Add custom scouts for search quality and lesson completion** once `search_performed` and `lesson_completed` events are instrumented in the codebase (currently planned in `AGENTS.md` but not yet captured).
- [ ] **Add custom scouts for video playback funnel** once `video_play` and watch-percentage events are captured.
- [ ] **Enable `signals-scout-feature-flags`** if you start using PostHog feature flags to gate features.
- [ ] **Enable `signals-scout-experiments`** if you run A/B experiments.
- [ ] **Save funnel and retention insights in PostHog** so `signals-scout-product-analytics` has concrete flows to watch (it scans saved insights, not raw events).
- [ ] **Create dashboards** so `signals-scout-anomaly-detection` has baselines to watch against.

---

## What happens next

- The scout coordinator picks up the new configs within ~30 minutes and fires the first runs.
- Each run draws from the 100-run daily budget. With 5 scouts active, roughly 5 runs fire per day — well within budget.
- Findings cluster into reports in the [Self-driving inbox](https://us.posthog.com/project/585154/inbox).
- Immediately-actionable reports can automatically start coding tasks (draft PRs via GitHub).
- Replay Vision scanners start observing as soon as recordings arrive.
