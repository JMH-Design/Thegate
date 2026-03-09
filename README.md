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
- **Middleware**: Refreshes session on each request; redirects unauthenticated users to `/login`.

### 2. Onboarding (First-Time User Experience)

- **Route:** `/onboarding`
- **Flow:** Conversational FTUE. Claude asks about role, goals, expertise, and gaps. User chats until ready, then clicks "Extract & Continue."
- **Backend:** `POST /api/onboarding` with `action: "extract_profile"` parses the conversation and writes a structured `profile` JSON to `users.profile`.
- **Outcome:** User is redirected to the Knowledge Map (`/`).

### 3. Knowledge Map (Home)

- **Route:** `/`
- **Data:** Topics (user's topics), benchmarks (public reference data), user profile.
- **UI:**
  - List of topic cards with depth level, status (needs_review / developing / strong), last tested date, mental model snippet.
  - "New Topic" button opens a form.
- **New Topic Flow:**
  - User types a topic and clicks "Start" or presses Enter.
  - `getUserMedia` is called (user gesture) to pre-acquire the microphone.
  - Stream is stored in `voice-pre-session.ts`; user is navigated to `/session/new?topic=...`.
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

### Transcription

- **Primary:** OpenAI Realtime API (WebRTC). Ephemeral token from `/api/voice/realtime-token` (GA `client_secrets` endpoint). Partial transcripts as user speaks; final transcript on turn end. Token refresh every 45s; on expiry, user taps Reconnect.
- **Fallback:** VAD (MicVAD) + Whisper. No partial transcripts; "Speak now" / "Processing your speech..." states; "Using backup voice" indicator.

### Text-to-Speech

- **Provider:** ElevenLabs (`/api/voice/tts`). Streaming MP3 via `MediaSource` + `SourceBuffer` for low latency.
- **Chunking:** Phrase-level (sentence, comma, semicolon) to start playback sooner.
- **Interrupt:** When user speaks during coach response, TTS stops and queue clears.

### Error Handling

- **`lib/voice-errors.ts`:** Maps raw errors (network, auth, mic denial, token expiry, API) to user-facing messages and suggested actions.
- **Reconnect:** Explicit button when `voiceError` is set; triggers `getUserMedia` and re-establishes connection.

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Streaming chat with Claude; uses coach system prompt (audio vs text mode) |
| `/api/onboarding` | POST | FTUE conversation; extract profile |
| `/api/sessions/close` | POST | Analyze transcript, persist session, update topic |
| `/api/voice/realtime-token` | POST | Fetch OpenAI Realtime GA client secret |
| `/api/voice/tts` | POST | ElevenLabs streaming TTS |
| `/api/voice/transcribe` | POST | Whisper batch transcription (fallback) |
| `/api/topics/cluster` | POST | Topic clustering (knowledge map) |
| `/api/topics/suggest-icon` | POST | Icon suggestions for topics |
| `/api/db/check-icon-column` | GET | DB schema check |

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

| Level | Label | Test |
|-------|-------|------|
| 1 | Familiarity | "Describe it in 1-2 sentences" |
| 2 | Explanation | "Why does it work that way?" |
| 3 | Prediction | "What happens if [condition changes]?" |
| 4 | Intervention | "If it were broken, how would you fix it?" |
| 5 | Generation | "Build something using this" |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (Postgres, Auth, pgvector) |
| AI (LLM) | Anthropic Claude via Vercel AI SDK v6 |
| AI (STT) | OpenAI Realtime API, Whisper (fallback) |
| AI (TTS) | ElevenLabs |
| Caching | Upstash Redis |
| State | TanStack React Query (session/topic data) |
| Icons | Lucide React |
| Deployment | Vercel |

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
│   └── layout.tsx
├── components/
│   ├── knowledge-map/          # Home: topic cards, new topic form
│   ├── session/                # Chat, voice mode, topic entry, controls
│   ├── session-close/          # Summary, level progression, benchmark, self-test
│   ├── providers/              # QueryClientProvider
│   └── ui/                     # Button, Card, Input, etc.
├── hooks/
│   ├── use-voice-session.ts    # Voice orchestration (realtime + fallback, TTS)
│   ├── use-realtime-transcription.ts
│   ├── use-vad-whisper-transcription.ts
│   ├── use-session-chat.ts      # TanStack Query for session/topic data
│   └── use-tts-playback.ts     # Session-close TTS
├── lib/
│   ├── prompts/                # coach-system, coach-audio, coach-text, analysis, ftue
│   ├── cache/conversation-context.ts  # Redis message cache
│   ├── voice-errors.ts         # Error mapping for voice UX
│   ├── voice-pre-session.ts    # Pre-acquired mic stream (new topic)
│   ├── audio-utils.ts          # WAV conversion for Whisper
│   ├── supabase/               # Server/client, middleware
│   ├── knowledge-map/          # Similarity, pack hierarchy, connections
│   └── types.ts
├── middleware.ts               # Session refresh
supabase/
├── migrations/                 # 001_initial_schema, 002_add_topic_icon
└── seed/                       # benchmarks.sql
```

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

*Most people walk past. We stay.*
