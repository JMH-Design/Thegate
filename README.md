# The Gate

**Repository:** [github.com/JMH-Design/Thegate](https://github.com/JMH-Design/Thegate)

**Cure imposter syndrome. Permanently.**

Not by making people feel better — by making them genuinely smarter and showing them the evidence.

---

## What It Does

The Gate measures one thing: **how deeply you actually understand something**. Then it shows you where that puts you in the room.

### Three Pillars

1. **Know What You Know** — Your knowledge map. Depth levels earned through demonstrated performance.
2. **Know Where the Room Is** — Cited benchmarks show where most people sit on every topic.
3. **Know What's Next** — The specific capability that separates your current level from the next.

---

## App Overview

The Gate is a voice-first coaching app that audits your understanding of any topic through Socratic dialogue. You speak with an AI coach that probes your depth of knowledge, adapts to your gaps, and tracks your progress across five depth levels. Sessions are analyzed, summarized, and used to update your knowledge map and mental model.

---

## User Flows

### 1. Sign Up / Login

- **Signup** (`/signup`): Email + password. Creates Supabase auth user and `users` row.
- **Login** (`/login`): Authenticates via Supabase Auth.
- **Middleware**: Refreshes session on each request; redirects unauthenticated users to `/login`. Redirects authenticated users without a profile to `/onboarding`. API routes are exempt from profile-check redirects so onboarding chat can function.

### 2. Onboarding (First-Time User Experience)

- **Route:** `/onboarding`
- **Flow:** Conversational FTUE. Claude asks about role, goals, expertise, and gaps. User chats until ready, then clicks "Extract & Continue."
- **Backend:** `POST /api/onboarding` with `action: "extract_profile"` parses the conversation and writes a structured `profile` JSON to `users.profile`.
- **Outcome:** User is redirected to the Knowledge Map (`/`).

### 3. Knowledge Map (Home)

- **Route:** `/`
- **Data:** Topics (user's topics), benchmarks (public reference data), user profile.
- **UI:**
  - List of topic cards with depth level (badge), status (needs_review / developing / strong), last tested date, mental model snippet, room benchmark marker.
  - "New Topic" button opens a form.
  - **Visualization modes:** PackMap (D3 zoomable circle pack) and CanvasMap (2D force graph with topic connections) are implemented but currently hidden; the list view is active.
- **New Topic Flow:**
  - User types a topic and clicks "Start" or presses Enter.
  - `getUserMedia` and `AudioContext` are created during the submit (user gesture) to pre-acquire the microphone and avoid autoplay rejection.
  - Stream and context are stored in `voice-pre-session.ts`; user is navigated to `/session/new?topic=...`.
  - If mic is denied: inline error with "Retry microphone" and "Continue with text mode" options.

### 4. Coaching Session

- **Route:** `/session/[topicId]`
  - `topicId === "new"` → new topic (no DB record yet).
  - `topicId === uuid` → existing topic (loads from DB).

#### Session Modes

- **Voice mode (default):** Real-time speech-to-text, streaming TTS responses, interrupt/barge-in.
- **Text mode:** Chat input; switch via "Text mode" link.

#### New Topic Session

1. Page loads with `NewTopicEntry` showing the topic name.
2. `useEffect` auto-starts: takes pre-acquired stream, calls `voice.start()`, sends `__START_SESSION__` to the chat API.
3. Coach responds with first diagnostic question; TTS plays the greeting.
4. User speaks; transcript is sent; coach responds; TTS plays in phrase-level chunks.

#### Returning Topic Session

1. Page loads with `ReturningTopicEntry`: topic name, current level, mental model, "Reinforce" and "Go deeper" buttons.
2. User clicks **Reinforce** or **Go deeper** (user gesture) → `voice.start()` + `sendMessage` with session intent.
3. Coach greets and begins the session.

#### Session UI

- **Header:** Back, level progression (e.g., Level 1 → 2), session number.
- **Voice mode:** Audio visualizer, live/partial transcript, "Speak now" or "Listening..." (fallback vs realtime), mute/pause/end controls, Reconnect button on error.
- **Text mode:** Chat messages, input, switch-to-voice button.
- **End session:** Available after 4+ messages; navigates to session-close.

### 5. Session Close (Summary)

- **Route:** `/session-close/[sessionId]`
- **Flow:**
  1. Load session, topic, and benchmark from Supabase.
  2. Display level progression, room benchmark comparison, session summary, self-test questions.
  3. Auto-play TTS readout of the summary (optional toggle).
  4. "Back to map" returns to `/`.

### 6. Session Analysis (Backend)

- **Trigger:** User clicks "End session" on the session page.
- **API:** `POST /api/sessions/close` with `topicId`, `topicName`, `transcript`, `previousLevel`.
- **Process:**
  1. Claude analyzes transcript → `SessionAnalysis` (depth level, gap types, mental model update, summary, self-test questions).
  2. Insert `sessions` row.
  3. Update `topics` (level, mental_model, common_errors, last_tested_at, status).
  4. Clear Redis conversation cache for the topic.
  5. Redirect to `/session-close/[sessionId]`.

---

## Voice Architecture

### Mic Pre-Acquisition

- On the knowledge map, clicking "Start" on a new topic calls `getUserMedia` and creates an `AudioContext` during the user gesture. The stream and context are stored in `voice-pre-session.ts` and carried into `/session/new`, avoiding autoplay rejection on the session page.
- If mic is denied: inline error with "Retry microphone" and "Continue with text mode" options.

### Transcription

- **Primary:** OpenAI Realtime API (WebRTC). Ephemeral token from `/api/voice/realtime-token` (GA `client_secrets` endpoint). Partial transcripts as user speaks; final transcript on turn end. Token refresh every 45s; on expiry, user taps Reconnect. State updates use `onConnectionStateChange` for reliability.
- **Fallback:** VAD (MicVAD) + Whisper. No partial transcripts; "Speak now" / "Processing your speech..." states; "Using backup voice" indicator.

### Text-to-Speech

- **Provider:** ElevenLabs (`/api/voice/tts`). Streaming MP3 via `MediaSource` + `SourceBuffer` for low latency.
- **Chunking:** Phrase-level (sentence, comma, semicolon) to start playback sooner.
- **Interrupt:** When user speaks during coach response, TTS stops and queue clears.
- **Error state:** `ttsError` tracks `NotAllowedError` and other playback failures; surfaced in the UI.

### Error Handling

- **`lib/voice-errors.ts`:** Maps raw errors (network, auth, mic denial, token expiry, API) to user-facing messages and suggested actions.
- **Reconnect:** Explicit button when `voiceError` is set; triggers `getUserMedia` and re-establishes connection.
- **Voice state:** Managed via `useState` with ref-based cleanup (switched from `useSyncExternalStore` for React 19 compatibility).

---

## API Routes

| Route                       | Method | Purpose                                                                   |
| --------------------------- | ------ | ------------------------------------------------------------------------- |
| `/api/chat`                 | POST   | Streaming chat with Claude; uses coach system prompt (audio vs text mode) |
| `/api/onboarding`           | POST   | FTUE conversation; extract profile                                        |
| `/api/sessions/close`       | POST   | Analyze transcript, persist session, update topic                         |
| `/api/voice/realtime-token` | POST   | Fetch OpenAI Realtime GA client secret                                    |
| `/api/voice/tts`            | POST   | ElevenLabs streaming TTS                                                  |
| `/api/voice/transcribe`     | POST   | Whisper batch transcription (fallback)                                    |
| `/api/topics/cluster`       | POST   | Topic clustering (knowledge map)                                          |
| `/api/topics/suggest-icon`  | POST   | Icon suggestions for topics                                               |
| `/api/db/check-icon-column` | GET    | DB schema check                                                           |

---

## Data Model

### Core Tables

- **users:** `id`, `email`, `profile` (JSON: role, goals, expertise, etc.)
- **topics:** `id`, `user_id`, `name`, `current_depth_level`, `status`, `last_tested_at`, `mental_model`, `common_errors`, `icon`
- **sessions:** `id`, `user_id`, `topic_id`, `transcript`, `depth_level_before`, `depth_level_after`, `gap_types`, `session_summary`
- **benchmarks:** `topic_name`, `benchmark_level`, `description`, `source_name`, `source_url` (public read)

### Caching

- **Upstash Redis:** Conversation context for chat. Key `conv:{sessionId}`; last 20 messages; 24h TTL. Used by `/api/chat` to merge cached + incoming messages. Cleared on session close.

---

## The Five Depth Levels

| Level | Label        | Test                                       |
| ----- | ------------ | ------------------------------------------ |
| 1     | Familiarity  | "Describe it in 1-2 sentences"             |
| 2     | Explanation  | "Why does it work that way?"               |
| 3     | Prediction   | "What happens if [condition changes]?"     |
| 4     | Intervention | "If it were broken, how would you fix it?" |
| 5     | Generation   | "Build something using this"               |

---

## Tech Stack

| Layer         | Technology                                 |
| ------------- | ------------------------------------------ |
| Framework     | Next.js 16.1.6 (App Router) + TypeScript 5 |
| React         | React 19.2                                 |
| Styling       | Tailwind CSS v4                            |
| Database      | Supabase (Postgres, Auth, pgvector)        |
| AI (LLM)      | Anthropic Claude via Vercel AI SDK v6      |
| AI (STT)      | OpenAI Realtime API, Whisper (fallback)    |
| AI (TTS)      | ElevenLabs                                 |
| Caching       | Upstash Redis                              |
| State         | TanStack React Query v5                    |
| Visualization | D3.js, react-force-graph-2d                |
| Icons         | Lucide React                               |
| Testing       | Vitest, Testing Library, jsdom             |
| Deployment    | Vercel                                     |

---

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── chat/               # Streaming chat
│   │   ├── onboarding/         # FTUE profile extraction
│   │   ├── sessions/close/     # Session analysis + persist
│   │   ├── voice/              # realtime-token, tts, transcribe
│   │   ├── topics/             # cluster, suggest-icon
│   │   └── db/                 # check-icon-column
│   ├── login/
│   ├── signup/
│   ├── onboarding/             # FTUE page
│   ├── session/[topicId]/      # Coaching session page
│   ├── session-close/[sessionId]/  # Post-session summary
│   ├── layout.tsx              # Root layout (QueryProvider, ToastProvider)
│   ├── page.tsx                # Knowledge Map (home)
│   └── globals.css             # Design tokens, dark theme, animations
├── components/
│   ├── knowledge-map/
│   │   ├── knowledge-map.tsx   # Topic list, new topic form
│   │   ├── topic-card.tsx      # Depth level, status, mental model
│   │   ├── depth-badge.tsx     # Depth level badge
│   │   ├── room-marker.tsx     # Benchmark marker
│   │   ├── pack-map.tsx        # D3 zoomable circle pack (hidden; list view active)
│   │   └── canvas-map.tsx      # 2D force-graph with connections (hidden)
│   ├── session/
│   │   ├── voice-mode.tsx      # Visualizer, transcript, controls
│   │   ├── voice-transcript.tsx
│   │   ├── voice-controls.tsx  # Mute, pause, end
│   │   ├── audio-visualizer.tsx
│   │   ├── session-header.tsx  # Back, level progression, session #
│   │   ├── topic-entry.tsx     # NewTopicEntry, ReturningTopicEntry
│   │   ├── chat-input.tsx
│   │   └── chat-message.tsx
│   ├── session-close/
│   │   ├── session-summary.tsx
│   │   ├── level-progression.tsx
│   │   ├── room-benchmark.tsx
│   │   └── self-test.tsx
│   ├── providers/
│   │   └── query-provider.tsx  # TanStack React Query
│   └── ui/
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── toast.tsx           # Toast notifications (ToastProvider in root layout)
│       ├── skeleton.tsx        # Loading skeleton
│       ├── loading-spinner.tsx
│       └── section-header.tsx
├── hooks/
│   ├── use-voice-session.ts    # Voice orchestration (realtime + fallback, TTS)
│   ├── use-realtime-transcription.ts
│   ├── use-vad-whisper-transcription.ts
│   ├── use-session-chat.ts     # TanStack Query for session/topic data
│   ├── use-tts-playback.ts     # Session-close TTS
│   └── __tests__/              # Vitest repro tests for voice hooks
├── lib/
│   ├── prompts/                # coach-system, analysis, ftue-system
│   ├── cache/conversation-context.ts  # Redis message cache
│   ├── voice-errors.ts         # Error mapping for voice UX
│   ├── voice-pre-session.ts    # Pre-acquired mic stream + AudioContext
│   ├── audio-utils.ts          # WAV conversion for Whisper
│   ├── supabase/               # Server, client, middleware
│   ├── knowledge-map/
│   │   ├── pack-hierarchy.ts   # Pack layout data for D3
│   │   ├── similarity-hierarchy.ts  # Topic clustering for pack view
│   │   ├── connections.ts      # Topic connections for force graph
│   │   └── icon-cache.ts       # Lucide icon whitelist + cache
│   ├── utils.ts                # Shared utilities
│   ├── date-utils.ts           # Date formatting
│   └── types.ts
├── middleware.ts               # Session refresh, auth redirects
supabase/
├── migrations/                 # 001_initial_schema, 002_add_topic_icon
└── seed/                       # benchmarks.sql
```

---

## Testing

| Tool            | Purpose                                      |
| --------------- | -------------------------------------------- |
| Vitest          | Test runner (jsdom environment, 35s timeout) |
| Testing Library | React component rendering + queries          |

```bash
npm run test          # Single run
npm run test:watch    # Watch mode
```

Test files live in `src/hooks/__tests__/` and focus on voice session lifecycle:

- **`voice-connection.repro.test.tsx`** — Realtime transcription connection, `getUserMedia` ordering, step-by-step diagnostics.
- **`session-start-speaking.repro.test.tsx`** — Session auto-start, TTS playback, autoplay rejection handling, reconnect flow.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project (free tier)
- Anthropic API key
- OpenAI API key (Realtime + Whisper)
- ElevenLabs API key
- Upstash Redis (optional; for conversation cache)

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### Setup

1. Clone and install:

```bash
cd the-gate
npm install
```

2. Copy `.env.local` and fill in keys.

3. Run migrations in Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_add_topic_icon.sql
```

4. Seed benchmarks (optional):

```
supabase/seed/benchmarks.sql
```

5. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

Push to GitHub and connect to Vercel. Set all environment variables in the Vercel dashboard. Deployments trigger on push to `main`.

---

_Most people walk past. We stay._
