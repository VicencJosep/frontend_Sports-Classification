# Football Intelligence — frontend (MVP v1)

React + TypeScript + Vite presentation layer over the [Sports-Classification](../Sports-Classification) football video
analysis pipeline. It shows analysed matches, lets the user upload a new one, and plays the original video with
analysis layers drawn on a canvas: players, ids, teams, ball, tracking trails, possession, ball actions and an event
timeline.

The frontend never runs AI code. It renders what the Python pipeline already produced.

```
Python outputs (tracks.jsonl, teams.json, telemetry.json)
        │  exact shapes, snake_case
        ▼
src/adapters/python      ← raw types + guards + converters
        ▼
src/domain               ← frontend domain model (Match, TrackingFrame, MatchEvent, BallAction, TeamAssignments)
        ▼
src/services             ← MatchService interface: MockMatchService today, FastAPI implementation later
        ▼
pages / components       ← UI never sees raw JSON
```

## Scripts

| Command             | What it does                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                                   |
| `npm run build`     | Typecheck (`tsc -b`) and production build into `dist/`                            |
| `npm run preview`   | Serve `dist/`                                                                     |
| `npm run lint`      | ESLint (flat config, react-hooks v7 rules)                                        |
| `npm run typecheck` | `tsc -b`                                                                          |
| `npm test`          | Vitest (adapters on real pipeline samples, frame/time maths, stores)              |
| `npm run fixtures`  | Rebuild `public/mock/` from the Python project's real outputs (needs `ffmpeg`)    |

Node 22, npm 10. Dependencies beyond the Vite template: `react-router` (routing) and `vitest` (tests).

## Project structure

```
src/
├── app/            App.tsx, router.tsx, providers (services, settings), shell (top bar, sidebar, Page)
├── pages/          Dashboard, Matches, Upload, Match (viewer), Settings, NotFound, RouteError
├── components/
│   ├── common/     Button, Badge, Panel, Toggle, Field, States, icons
│   ├── matches/    MatchCard, MatchList, StatusBadge
│   ├── video/      VideoStage, OverlayCanvas, PlayerControls, Timeline, overlay/renderOverlay.ts (pure canvas drawing)
│   ├── layers/     layer definitions + availability, LayerPanel
│   ├── events/     EventList, BallActionList, badges
│   └── players/    TrackletPanel
├── domain/         vocabularies (string unions), Match/MatchPart, TrackingFrame, events, teams, display mappings
├── adapters/python raw.ts (Python JSON shapes), guards.ts, tracks.ts, teams.ts, telemetry.ts, real-data tests
├── services/       MatchService.ts (interface), createMatchService.ts (factory by VITE_DATA_SOURCE), mock/
├── lib/            VideoClock (external store synced to the <video>), TrackingStore (frame-indexed data + trails)
├── hooks/          useAsync, useVideoClock (useSyncExternalStore selectors)
├── utils/          time formatting, cx
└── styles/         tokens.css (dark theme, green accent), global.css
scripts/            build-fixtures.mjs + fixtures.config.json
public/mock/        generated fixtures (videos are git-ignored; run `npm run fixtures`)
```

## Match model

A **match** has one or two **parts**: the whole match as one video, or two halves as two videos. Each part is one
pipeline run, with its own video, tracking, team clusters, events and ball actions. The viewer switches parts with
tabs; the URL keeps the selected part (`?part=second-half`).

Match metadata (name, teams, score, date, status) does not exist in the Python project, which only records the
source video path. It is owned by the service layer: the mock manifest today, the backend registry later.

## Video and overlays

The viewer uses the **original video** plus a **canvas overlay**, not the pipeline's annotated `final.mp4`
(which is MPEG-4 Part 2 written by OpenCV and does not play in browsers).

- `lib/videoClock.ts` mirrors the `<video>` element in an external store. It uses `requestVideoFrameCallback`
  (the presented frame's `mediaTime`) with a `requestAnimationFrame` fallback and derives the pipeline frame index
  as `floor((t - startTime) * fps)`.
- `components/video/overlay/renderOverlay.ts` is a pure function of a scene (frame, store, teams, layers,
  settings, transform). It draws the same encodings the pipeline's renderer uses: open ellipse at the feet, id or
  jersey label, team colour, trail, ball triangle, possessor ring, ball-action badge.
- Coordinates are pixels of the source frame; `fitContain` maps them onto the displayed video box.
- `lib/trackingStore.ts` indexes frames by `frame_idx` and derives trails and tracklet summaries. It never
  recomputes detection, tracking or possession.

Layers: Players, Player IDs, Teams, Ball, Tracking (trails), Possession, Ball actions and **Event & action cards**
(the on-video notifications of the pipeline's `final.mp4`: current event with its confidence, latest ball action
with the player who made it: jersey number when the detector read one, tracker id and team). Quick toggles under
the video switch each layer with one click; the Layers panel has the same switches with hints and the team legend.
Trajectories and Heatmap are shown as future capabilities because the pipeline does not produce them. A layer is
disabled when the part has no data for it (for example teams when the analysis ran without team classification).

**Play history**: the chronological list of detected events (goal, shot, penalty, corner, throw-in, kick-off, foul,
card, substitution) with filters; clicking a row (or a marker on the timeline) seeks the video to that moment.
Goals, shots and penalties get bigger markers. The Ball actions tab lists every pass / drive / header / high pass /
throw-in attributed to a player.

Branding follows [ugiat.com](https://ugiat.com): logo in `public/brand/`, cyan `#00aeef` accent, the brand
gradient, Montserrat for headings and Roboto for text (Google Fonts).

## Data contract (what the pipeline produces)

| File                                   | Written by                         | Content                                                                                                   |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<video>.tracks.jsonl`                 | `core/tracking.py`                 | one record per frame: `frame_idx`, `timestamp_s`, `tracks[]` (tracker_id, xyxy, anchor_xy, role, jersey), `ball` |
| `<video>.possession.jsonl`             | `core/possession.py`               | tracks record plus `possessor_tracker_id`                                                                 |
| `tracks_2d.jsonl`                      | `core/homography.py`               | tracks record plus `homography_ok` and per-track `field_xy` in metres (105 x 68, corner origin)           |
| `teams.json`                           | `core/classification.py`           | `teams[] {tracker_id, team_cluster}`, `excluded[]`; clusters are 0/1 with no names                        |
| `telemetry.json` (full match)          | `analytics/engine.py`              | `events[]` spans `{label, start_s, end_s, peak_confidence, mean_confidence, n_windows}`, `ball_actions[]` |
| `telemetry.json` (clip)                | `analytics/engine.py`              | single `event` prediction (may be `background_*`), `ball_actions[]`                                       |

Facts the frontend relies on:

- Event labels: card, corner, foul, goal, kick-off, penalty, shot, substitution, throw-in. Ball actions: pass,
  drive, high_pass, header, throw_in, background. Unknown labels render with a neutral style.
- Events have no id, team or player. The adapter synthesises ids and uses the span start as seek point.
- Ball actions are indexed by frame; `fps` is not stored in telemetry, so it is part of the part's video metadata.
- `tracker_id` is a tracklet, not a stable player identity. Jersey numbers are read for a minority of detections.
- The ball is detected in roughly a third of frames; the viewer can hold the last position for a few frames.

## Mock data

`npm run fixtures` builds `public/mock/matches/` from real runs in `../Sports-Classification` (read only):
75-second excerpts re-encoded to H.264, with tracks, possession, teams and telemetry sliced to the same window and
re-based to start at frame 0. The JSON keeps the exact Python shapes, so the adapters run on real data. Three
metadata-only matches exercise the pending, processing and error states. Matches created through the Upload page
are stored in `localStorage` and move to *processing*; they never complete without a backend.

## Backend (FastAPI)

By default the UI talks to the FastAPI backend in `../Sports-Classification/backend` through the Vite dev/preview
server, which proxies `/api` to `http://127.0.0.1:8100` (`VITE_PROXY_TARGET`); the browser only needs the Vite port.
`VITE_API_BASE_URL` points the browser straight at the backend instead; `VITE_DATA_SOURCE=mock` uses the bundled fixtures. The backend normalises the
pipeline outputs itself, so `src/services/api/ApiMatchService.ts` only maps its snake_case JSON to the domain
(`src/adapters/api/`); the Python adapters in `src/adapters/python/` are used by the mock service only.

End-to-end flow: **Upload** sends each video to `POST /api/videos/upload` (XHR, with progress), creates the match
(`POST /api/matches`) and starts the analysis (`POST /api/matches/{id}/analysis`). The match page polls the backend
every 5 s while the status is `pending`/`processing` and shows the pipeline stage; when a part is `completed` the
viewer loads the analysis and streams the video from `GET /api/videos/{id}/content`. Tracking is fetched by 30 s
windows around the playhead (`useTrackingWindows`), because a full match has ~145k frames.

Run everything:

```bash
# 1) backend, inside the Sports-Classification container (see ../Sports-Classification/backend/README.md)
docker exec -d -w /app/backend Sports-Classification sh -c '.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100 > /tmp/uvicorn.log 2>&1'
# 2) frontend, on the host
npm run dev            # http://localhost:5173 (listens on all interfaces)
```

Working over SSH: forward port 5173 (VS Code: command palette, "Forward a Port", 5173; or `ssh -L 5173:127.0.0.1:5173 user@server`)
and open http://localhost:5173 on your laptop. Nothing else needs forwarding, the API goes through the same port.
