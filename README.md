# TwinMind

Real-time AI copilot for live conversations.

**Live demo:** [twinmind-ai-fawn.vercel.app](https://twinmind-ai-fawn.vercel.app)

---

## Overview

TwinMind listens to a live conversation through the microphone, transcribes speech in 30-second chunks via Groq Whisper, and continuously generates typed, contextual suggestions — answers, clarifications, fact-checks, insights — based on what is being said right now. A grounded chat interface lets you drill into any suggestion or ask free-form questions with the full transcript as context.

The hard problem is not transcription or text generation. It is surfacing the right type of intervention at the right moment — before the conversation has moved on — without adding cognitive load.

```
Mic → MediaRecorder (30s chunks) → Whisper → Transcript → Suggestions + Chat
```

---

## Features

- **Streaming transcription** — 30-second audio chunks sent to Groq Whisper. Segments appear as transcribed, timestamped, auto-scrolling.
- **Typed suggestion cards** — After each chunk, the engine infers conversational mode and generates exactly 3 suggestion cards per refresh: one reactive, one proactive, one wildcard. Types: `ANSWER`, `CLARIFY`, `FACT_CHECK`, `INSIGHT`, `QUESTION`, `DEFINITION`, `PIVOT`.
- **Two-window context** — Suggestions use the last ~600 tokens of raw transcript (anchor window) plus a lazily-computed LLM summary of everything before it. Recency is preserved without dropping early context.
- **Three-gate validation** — Every suggestion batch passes Zod schema validation, semantic heuristic checks (type uniqueness, preview specificity, anchor quality), and graceful degradation. If a refresh fails both attempts, the previous batch stays visible with a stale indicator. The panel is never blank.
- **Pre-generated detail prompts** — Each suggestion card carries a `detail_prompt` generated inside the suggestion call at near-zero marginal cost. Clicking a card routes it directly to chat — no re-reasoning, sub-1s response onset.
- **Streaming chat** — Responses stream token-by-token, grounded in the full current transcript. Chat and suggestions use separate prompt chains.
- **Session export** — Full session (transcript, suggestion batches with `inferred_mode` + `anchor_window_snapshot`, chat history) serializes to JSON for post-session review and debugging.
- **Settings modal** — Groq API key and `contextWindowTokens` (default: 600) are user-configurable and persisted to `localStorage`.

---

## Architecture

```
[Mic Input]
     │
     ▼
[MediaRecorder — 30s chunks, audio/webm;codecs=opus]
     │
     ▼
[POST /api/transcribe → Groq Whisper Large V3]
     │
     ▼
[transcriptStore — append-only {id, ts, text}]
     │
     ├─────────────────────────────────────┐
     ▼                                     ▼
[POST /api/suggestions               [POST /api/chat
 Groq LLM — 3 typed cards]           Groq LLM — streaming]
     │                                     │
     ▼                                     ▼
[SuggestionsPanel                    [ChatPanel
 atomic batch render]                 token-by-token stream]
```

### Timing

```
t=0s    Recording starts
t=30s   Chunk 1 → Whisper (~1s) → transcript appended → suggestion refresh triggered
t=31s   contextBuilder assembles anchor window + summary window
t=33s   Batch validated, 3 cards render
t=60s   Chunk 2 → same cycle
t=Xs    User clicks card → detail_prompt → chat stream begins (<1s onset)
```

### Layer responsibilities

| Layer | Owns |
|---|---|
| `hooks/` | State, side effects, lifecycle |
| `services/` | Pure async functions — all fetch calls, no store access |
| `store/` | Global client state (Zustand) |
| `components/` | Presentational only — no business logic |
| `app/api/` | Request validation, Groq API calls, streaming |
| `utils/validators.ts` | Zod schemas — API response boundary enforcement |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| UI | React, Tailwind CSS |
| State | Zustand |
| Speech-to-text | Groq Whisper Large V3 |
| LLM | Groq (suggestions + chat) |
| Deployment | Vercel |
| Validation | Zod |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Groq API key](https://console.groq.com)

### Install

```bash
git clone https://github.com/your-username/twinmind.git
cd twinmind
npm install
```

### Configure

```bash
cp .env.example .env.local
# Add GROQ_API_KEY to .env.local
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app reads `GROQ_API_KEY` from the environment. You can also enter a key at runtime via the Settings modal — it will be stored in `localStorage` and sent per request.

---

## Environment Variables

```env
# .env.local

# Groq API key — required for transcription, suggestions, and chat
GROQ_API_KEY=gsk_...
```

The server-side key is the default. The Settings modal allows a per-client override, useful for shared deployments or local dev without modifying `.env.local`.

---

## Project Structure

```
src/
├── app/
│   └── page.tsx                    # Orchestration — wires hooks to layout
├── app/api/
│   ├── transcribe/route.ts         # POST — audio → Whisper → text
│   ├── suggestions/route.ts        # POST — transcript context → typed suggestion batch
│   └── chat/route.ts               # POST — message + transcript → streaming response
├── components/
│   ├── TranscriptPanel.tsx         # Left: append-only segment feed
│   ├── SuggestionsPanel.tsx        # Middle: batched suggestion cards
│   ├── ChatPanel.tsx               # Right: streaming chat history + input
│   ├── MicButton.tsx               # Start / stop recording
│   └── SettingsModal.tsx           # API key + context window config
├── hooks/
│   ├── useMicRecorder.ts           # MediaRecorder lifecycle, chunk dispatch
│   ├── useSuggestions.ts           # Refresh cycle, rolling summary, card routing
│   └── useChat.ts                  # Message state, streaming, turn history
├── services/
│   ├── contextBuilder.ts           # Anchor window slicing + summary injection
│   ├── suggestionService.ts        # Suggestion call + three-gate validation
│   ├── chatService.ts              # Streaming chat call + history management
│   └── groqClient.ts               # Shared Groq client (key injection, error handling)
├── store/
│   ├── transcriptStore.ts          # Append-only transcript segments
│   ├── suggestionStore.ts          # All suggestion batches for the session
│   └── settingsStore.ts            # API key, contextWindowTokens (persisted)
└── utils/
    ├── validators.ts               # Zod schemas for suggestions and chat
    └── exportService.ts            # Session serialization to JSON
```

---

## Key Design Decisions

**Chunk cadence and suggestion cadence are synchronized at 30s.**
Decoupling them creates race conditions where suggestions render before the transcript they reference is visible. One event — a new transcript chunk — drives the full pipeline. This is a co-design constraint, not a coincidence.

**Three API routes, not one catch-all.**
`/api/transcribe`, `/api/suggestions`, and `/api/chat` are isolated. Each has its own input validation, error handling, and retry logic. A suggestion retry does not affect an in-flight chat stream.

**Services are pure functions; hooks own state.**
No Zustand access inside `services/`. Services receive data as arguments and return results. This keeps services testable in isolation and prevents business logic from leaking into API call functions.

**`detail_prompt` is pre-generated inside the suggestion call.**
Costs near-zero marginal tokens. Eliminates a full re-reasoning step on card click. The click-to-first-token gap is where users lose trust fastest — this closes it structurally, not through infrastructure optimization.

**Suggestions render atomically; chat streams.**
Two different UX contracts. Partial suggestion sets are confusing — the 3-card structure is the unit of value and must appear complete. Chat streams because progress reduces perceived wait time when the user is actively waiting.

**Rolling summary over hard context truncation.**
Cutting the transcript at a fixed token window permanently drops early context — the agenda, names, the problem statement. Compressing older context into a lazily-updated summary preserves semantic continuity at predictable token cost. The summary is recomputed every 10 minutes, not per request.

**Three-gate validation with graceful degradation.**
Gate 1: Zod schema (structure). Gate 2: semantic heuristics (type uniqueness, preview specificity, anchor quality). Gate 3: if both attempts fail, retain the previous batch with a stale indicator. The suggestion panel is never blank — a stale-but-valid batch is always less damaging than an empty or error state.

**`contextBuilder.ts` is a standalone service.**
Context assembly is shared by both `suggestionService` and `chatService`. Isolating it gives a single source of truth for what gets sent to the model, and makes context logic independently testable.

---

## Future Improvements

1. **Server-side session state** — Move transcript and session data to a backend for cross-device continuity, crash recovery, and server-side summary computation.

2. **Speaker diarization** — Whisper Large V3 Turbo with diarization post-processing. Enables speaker-aware suggestions: "Ask Sarah to clarify her timeline estimate" instead of generic clarification prompts.

3. **RAG over meeting history** — Index past transcripts per user. Suggestions can reference prior sessions: "In your last meeting with this team, you agreed X." This is the product moat — longitudinal personal context.

4. **Streaming suggestion generation** — Stream each card as it is generated rather than waiting for the full batch. Faster time-to-first-suggestion at the cost of cards appearing sequentially rather than as a complete set.

5. **Suggestion personalization** — Track click patterns per suggestion type per user. Bias the 3-slot allocation toward types the individual actually engages with over time.

6. **Intent classification fine-tuning** — Replace in-prompt mode detection with a small dedicated classifier running client-side in under 50ms. Frees prompt budget for richer suggestion content.

7. **Confidence scoring** — Model assigns confidence per suggestion. Low-confidence cards render with a visual indicator, reducing trust erosion when the model is uncertain about conversational context.

---

## License

MIT
