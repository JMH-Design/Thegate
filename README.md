# The Gate

**Repository:** [github.com/JMH-Design/Thegate](https://github.com/JMH-Design/Thegate)

**Cure imposter syndrome. Permanently.**

Not by making people feel better — by making them genuinely smarter and showing them the evidence.

## What It Does

The Gate measures one thing: how deeply you actually understand something. Then it shows you where that puts you in the room.

### Three Pillars

1. **Know What You Know** — Your knowledge map. Depth levels earned through demonstrated performance.
2. **Know Where the Room Is** — Cited benchmarks show where most people sit on every topic.
3. **Know What's Next** — The specific capability that separates your current level from the next.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (Postgres + Auth + pgvector)
- **AI:** Anthropic Claude via Vercel AI SDK v6
- **Icons:** Lucide React
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- An Anthropic API key

### Setup

1. Clone the repo and install dependencies:

```bash
cd the-gate
npm install
```

2. Copy `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=sk-ant-your_key
```

3. Run the database migration in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
```

4. Seed benchmarks (optional but recommended):

```
supabase/seed/benchmarks.sql
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (chat, session close, onboarding)
│   ├── login/             # Auth pages
│   ├── signup/
│   ├── onboarding/        # FTUE conversational flow
│   ├── session/           # Coaching session UI
│   └── session-close/     # Post-session summary
├── components/
│   ├── knowledge-map/     # Home page components
│   ├── session/           # Chat interface components
│   ├── session-close/     # Session summary components
│   └── ui/                # Shared UI primitives
└── lib/
    ├── prompts/           # System prompts (core IP)
    ├── supabase/          # Database clients
    └── types.ts           # TypeScript type definitions
```

## The Five Depth Levels

| Level | Label | Test |
|-------|-------|------|
| 1 | Familiarity | "Describe it in 1-2 sentences" |
| 2 | Explanation | "Why does it work that way?" |
| 3 | Prediction | "What happens if [condition changes]?" |
| 4 | Intervention | "If it were broken, how would you fix it?" |
| 5 | Generation | "Build something using this" |

## Deployment

Push to GitHub and connect to Vercel. Set environment variables in Vercel dashboard. That's it.

---

*Most people walk past. We stay.*
