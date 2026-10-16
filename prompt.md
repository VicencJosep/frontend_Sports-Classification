# Sports-Classification Frontend — MVP v1

## 1. Project Context

We are building a football intelligence and video analysis platform.

The workspace contains two independent projects:

```text
/
├── Sports-Classification/
│   └── Existing Python AI / Computer Vision project
│
└── frontend_Sports-Classification/
    └── React frontend
```

The frontend project is located at `frontend_Sports-Classification/`.
The existing Python project is located at `Sports-Classification/`.

The Python project is the existing AI/computer vision system and is still under active development.

The frontend must be developed independently from the internal implementation of the AI models.

---

# 2. Existing Python Project

The `Sports-Classification` project is a Python-based football video analysis pipeline.

At a high level, it currently receives a football match video and produces:

- Player detection
- Player tracking
- Team identification / clustering
- Football event detection
- Annotated videos
- JSON files containing analysis results and timestamps

The exact implementation and data structures must NOT be assumed.

Before implementing the frontend, inspect the `Sports-Classification` project and understand:

- Existing classes
- Existing data structures
- Existing JSON outputs
- Player representation
- Team representation
- Event representation
- Tracking representation
- Timestamp formats
- Coordinates
- IDs
- Confidence values
- Existing processing pipeline
- Existing output files

The existing Python project is the source of truth for what is currently available.

Do not invent AI capabilities that do not exist.

The Python project will continue to evolve after the frontend MVP is implemented.

---

# 3. Frontend Technology

The frontend must be implemented inside:

```text
frontend_Sports-Classification/
```

Technology stack:

- React
- TypeScript
- Vite
- ESLint

Do not introduce another frontend framework.
Do not migrate to Next.js.
Do not introduce unnecessary dependencies before they are justified.

The frontend will eventually communicate with a Python backend built with FastAPI.

The future architecture is:

```text
React + TypeScript
        │
        │ HTTP / REST
        ▼
     FastAPI
        │
        ▼
Sports-Classification
        │
        ▼
 AI / Computer Vision Pipeline
```

The backend is NOT part of the current frontend implementation task.

---

# 4. Main Objective

The objective of MVP v1 is to build a professional football video analysis interface.

The application should allow the user to:

1. View previously analyzed football matches.
2. Upload a new match.
3. Open a match.
4. Watch the match video.
5. Visualize player detections.
6. Visualize player IDs.
7. Visualize team affiliation.
8. Visualize tracking information.
9. Visualize detected events.
10. Navigate through the match timeline.
11. Enable and disable visualization layers.

The application should feel like a professional football analytics / sports intelligence platform.

---

# 5. MVP v1 Scope

MVP v1 contains three main areas:

```text
Dashboard
    │
    ├── Existing Matches
    │
    └── Upload Match

Upload Match
    │
    └── Create / Analyze Match

Match Viewer
    │
    ├── Video
    ├── Player overlays
    ├── Team overlays
    ├── Tracking
    ├── Events
    └── Timeline
```

The frontend should be architected so that future football analytics functionality can be added without restructuring the entire application.

---

# 6. Visual Design

The visual identity should be:

> Professional Football Analytics / Sports Intelligence.

The interface should NOT look like:

- A generic Bootstrap dashboard
- A generic SaaS admin panel
- A gaming interface
- An excessively colorful sports website

It should feel like a professional technical analysis tool.

## Visual characteristics

- Dark mode as the primary visual style.
- Clean and minimal interface.
- Dark background.
- Slightly lighter panels/cards.
- Subtle borders.
- Clear typography.
- Compact but comfortable information density.
- Generous spacing where appropriate.
- Green as the main accent/action color.
- Semantic colors for events when useful.
- Avoid excessive use of colors.
- Use consistent spacing, typography and component styles throughout the application.

The UI should prioritize the video analysis experience.

The video viewer is the most important part of the application.

---

# 7. Global Layout

The application should have a consistent layout.

Conceptually:

```text
┌────────────────────────────────────────────────────────────┐
│ Football Intelligence                         + New Match │
├───────────────┬────────────────────────────────────────────┤
│               │                                            │
│ Dashboard     │                                            │
│               │              PAGE CONTENT                  │
│ Matches       │                                            │
│               │                                            │
│               │                                            │
│ Settings      │                                            │
│               │                                            │
└───────────────┴────────────────────────────────────────────┘
```

A sidebar/navigation structure can be used.

The exact implementation should be proposed after inspecting the existing frontend project.

---

# 8. Dashboard

The Dashboard is the main landing page.

Its purpose is to provide access to analyzed matches.

Conceptually:

```text
┌────────────────────────────────────────────────────────────┐
│ Football Intelligence                         + New Match │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Matches                                                    │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Barcelona 2 - 1 Real Madrid                            │ │
│ │ 12 Oct 2026 · 90:12                                    │ │
│ │ Analysis completed                                     │ │
│ │                                      [ Open Match ]    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Arsenal 1 - 0 Chelsea                                  │ │
│ │ 08 Oct 2026 · 91:04                                    │ │
│ │ Analysis completed                                     │ │
│ │                                      [ Open Match ]    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The Dashboard should show:

- Match name
- Home team
- Away team
- Score if available
- Date if available
- Duration
- Analysis status

Possible analysis states:

```text
Pending
Processing
Completed
Error
```

For the MVP, mock data may be used.

---

# 9. Upload Match

The user should be able to start the creation of a new match.

Conceptually:

```text
┌───────────────────────────────────────────────┐
│ Upload Match                                  │
│                                               │
│       ┌───────────────────────────────┐       │
│       │                               │       │
│       │       Drop video here         │       │
│       │                               │       │
│       │       or Browse files         │       │
│       │                               │       │
│       └───────────────────────────────┘       │
│                                               │
│ Match name: [________________________]        │
│                                               │
│ Home team:  [________________________]        │
│ Away team:  [________________________]        │
│                                               │
│              [ Start Analysis ]               │
└───────────────────────────────────────────────┘
```

For MVP v1, the real backend upload does not need to be implemented.

Use mock services where necessary.

However, the architecture should make it straightforward to replace the mock implementation with:

```text
Frontend
   ↓
POST /matches
   ↓
FastAPI
```

later.

---

# 10. Match Viewer

The Match Viewer is the core feature of the application.

It should prioritize the football video and its analysis layers.

Conceptually:

```text
┌──────────────────────────────────────────────────────────────┐
│ Barcelona 2 - 1 Real Madrid                                │
│ 90:12 · Analysis completed                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                       VIDEO                                  │
│                                                              │
│             ┌─────────────────────────────┐                  │
│             │                             │                  │
│             │          MATCH VIDEO        │                  │
│             │                             │                  │
│             │       ┌─────┐              │                  │
│             │       │  7  │              │                  │
│             │       └─────┘              │                  │
│             │                             │                  │
│             └─────────────────────────────┘                  │
│                                                              │
│ ▶ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━ 67:23 / 90:12   │
│                                                              │
├───────────────────────────┬──────────────────────────────────┤
│ LAYERS                    │ EVENTS                           │
│                           │                                  │
│ ☑ Players                │ 12:32  Pass                       │
│ ☑ Player IDs             │ 18:45  Shot                       │
│ ☑ Teams                  │ 23:12  Foul                       │
│ ☑ Ball                   │ 45:01  Corner                     │
│ ☑ Tracking               │ 67:23  Goal                       │
│ ☐ Trajectories           │                                  │
│ ☐ Heatmap                │                                  │
└───────────────────────────┴──────────────────────────────────┘
```

The exact layout can be improved if a better UX is identified, but these concepts must remain.

---

# 11. Video Viewer

The video viewer should be designed around:

```text
HTML video
+
Canvas overlay
```

The intention is NOT to rely exclusively on pre-rendered annotated videos.

The preferred future architecture is:

```text
Original Video
      +
Tracking Data
      +
Player Data
      +
Event Data
      +
Team Data
      ↓
React Video Viewer
      ↓
Canvas Overlays
```

This will allow visualization layers to be independently enabled or disabled.

The original annotated video generated by the Python project may still be useful for debugging and validation.

---

# 12. Visualization Layers

The Match Viewer should support independent visualization layers.

Initial layers:

```text
Players
Player IDs
Teams
Ball
Tracking
```

Future layers:

```text
Trajectories
Heatmaps
Tactical information
```

Each layer should be independently toggleable.

Example:

```text
☑ Players
☑ Player IDs
☑ Teams
☑ Ball
☑ Tracking
☐ Trajectories
☐ Heatmap
```

Do not implement functionality that requires data which does not currently exist.

If a layer is not yet supported by the Python pipeline, it may be disabled or presented as a future capability.

---

# 13. Player Visualization

Player visualization should support, depending on the actual Python outputs:

- Bounding boxes
- Player IDs
- Team affiliation
- Tracking positions

The frontend must use the actual player representation found in the Python project.

Do not assume player IDs, coordinate systems or tracking formats without inspecting the Python project.

---

# 14. Events

The application should provide an event timeline.

Initially the project may contain events such as:

```text
Shot
Foul
Pass
Goal
Corner
```

However, the frontend event system should be extensible.

Potential future events include:

```text
Card
Substitution
Offside
Free Kick
Throw In
Header
...
```

The exact currently supported event types must be obtained from the Python project.

Each event should conceptually contain:

```text
id
type
timestamp
team
player
confidence
```

Only fields actually available should be used.

---

# 15. Event Timeline

Events should appear in chronological order.

Example:

```text
12:32   Pass
18:45   Shot
23:12   Foul
45:01   Corner
67:23   Goal
```

Clicking an event should seek the video to the corresponding timestamp.

This interaction is important.

The event timeline should eventually support visual markers on the video timeline:

```text
       Goal        Shot
        ▼           ▼
────────●───────────●────────────────●────
                                      ▲
                                     Foul
```

---

# 16. Future Player Statistics

The application should be prepared for future player statistics.

Examples:

```text
Distance
Average Speed
Maximum Speed
Shots
Passes
Fouls
```

At the moment some of these values may not exist in the Python project.

Do NOT invent values.

Use placeholders such as:

```text
Distance       —
Average Speed  —
Maximum Speed  —
```

or disable the corresponding functionality.

When the Python pipeline starts producing these values, the frontend should be able to display them without requiring a major architectural redesign.

---

# 17. Future Team Statistics

The frontend architecture should also be prepared for:

```text
Possession
Passes
Shots
Fouls
Corners
Cards
```

These are future capabilities and are not necessarily part of the working MVP.

Do not implement fake calculations.

---

# 18. Future Visual Analytics

The application is expected to evolve towards:

```text
Heatmaps
Player trajectories
Passing networks
Team shape
Formation
Tactical analysis
Pressure
Distance covered
Speed analysis
```

These should be considered part of the future roadmap.

Do not implement them using invented data.

The architecture should make them easy to add later.

---

# 19. Domain Model

Potential domain entities include:

```text
Match
Team
Player
Event
TrackingPoint
Analysis
```

However, before defining TypeScript interfaces, inspect the Python project.

The TypeScript models should represent the actual available data.

The frontend should use a clean domain representation rather than exposing raw model-specific JSON directly to UI components.

If necessary, introduce adapters:

```text
Python Output
     ↓
Adapter / Normalization
     ↓
Frontend Domain Model
     ↓
React Components
```

---

# 20. Mock Data

Until the backend exists, use mock data.

Mock data should resemble realistic output from the actual Python project.

Do not create arbitrary structures without first inspecting the existing Python outputs.

The mock layer should be isolated so that it can later be replaced by API services.

Conceptually:

```text
Mock Services
     ↓
Frontend Domain Models
     ↓
UI
```

Later:

```text
FastAPI
     ↓
API Services
     ↓
Frontend Domain Models
     ↓
UI
```

The UI should not need to know whether the data comes from mocks or the backend.

---

# 21. API Preparation

The real FastAPI backend will be implemented later.

Potential endpoints may include:

```text
GET    /matches
POST   /matches
GET    /matches/{id}
GET    /matches/{id}/events
GET    /matches/{id}/players
GET    /matches/{id}/tracking
```

These are conceptual endpoints only.

Do not implement or assume a real API contract yet.

The frontend should use a service abstraction so that the real API can be connected later without rewriting UI components.

---

# 22. Frontend Architecture

Maintain clear separation between:

```text
Pages
Components
Domain Types
API Services
Mock Services
Hooks
Utilities
```

A possible structure is:

```text
src/
│
├── components/
│   ├── common/
│   ├── video/
│   ├── events/
│   ├── players/
│   ├── teams/
│   └── matches/
│
├── pages/
│   ├── Dashboard/
│   ├── Upload/
│   └── Match/
│
├── services/
│   ├── api/
│   └── mocks/
│
├── types/
│
├── hooks/
│
├── utils/
│
├── assets/
│
├── App.tsx
└── main.tsx
```

This is a proposal, not an absolute requirement.

If inspection of the project suggests a better structure, propose it before implementing.

Avoid unnecessary abstraction.

---

# 23. Important Architecture Rules

1. Do not put AI logic in React.
2. Do not duplicate Python logic in TypeScript.
3. Do not hard-code model-specific assumptions inside UI components.
4. Do not invent data that does not exist.
5. Keep mock data isolated.
6. Keep API communication isolated from UI components.
7. Keep domain types separate from UI components.
8. Prefer reusable components.
9. Avoid unnecessary dependencies.
10. Keep the frontend ready for the future FastAPI backend.
11. The frontend must remain functional even while the Python project continues evolving.
12. Do not redesign or modify the Python project unless explicitly requested.

---

# 24. First Task — Analysis Only

IMPORTANT:

Do NOT immediately start implementing the frontend.

The first task is to understand the existing project and propose the implementation architecture.

### Step 1

Inspect:

```text
Sports-Classification/
```

Understand the current Python project.

Identify:

- Current pipeline
- Main classes
- Current outputs
- JSON structures
- Player data
- Team data
- Event data
- Tracking data
- Available timestamps
- Available coordinates
- Existing annotated videos
- Anything relevant for the frontend

### Step 2

Inspect:

```text
frontend_Sports-Classification/
```

Understand the current React/Vite/TypeScript setup.

### Step 3

Compare the existing Python outputs with the proposed MVP.

Identify:

- What can be implemented immediately
- What requires mock data
- What data adapters will be needed
- What future functionality is not currently supported

### Step 4

Propose:

- Final frontend folder structure
- Domain TypeScript models
- Component architecture
- Page architecture
- Mock architecture
- API service architecture
- Video/canvas architecture
- Event timeline architecture

### Step 5

Explain any important architectural decisions.

Do NOT implement the complete application yet.

Do NOT create a large number of files yet.

Do NOT invent backend endpoints.

Do NOT invent AI functionality.

The first response should be an architectural analysis and implementation plan.

Wait for approval before beginning the actual implementation.

---

# 25. Development Philosophy

This project is expected to evolve.

The Python AI pipeline will continue to gain capabilities.

The frontend should therefore be designed as a stable presentation and interaction layer over evolving football intelligence data.

The long-term architecture is:

```text
                     FOOTBALL VIDEO
                            │
                            ▼
                Sports-Classification
                            │
                 AI / Computer Vision
                            │
                            ▼
                   Analysis Results
                            │
                            ▼
                       FastAPI
                            │
                            ▼
                    Football Memory
                            │
                            ▼
                 React Football UI
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
            Video        Analytics       Future
            Viewer       Dashboard       AI Agent
```

MVP v1 should focus on building a strong foundation for this architecture.

The goal is not to implement every future feature now.

The goal is to create a professional, extensible football analysis interface that can grow together with the Python AI system.
