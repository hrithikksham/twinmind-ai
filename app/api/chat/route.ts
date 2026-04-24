/**
 * /api/chat/route.ts
 *
 * Accepts a message (detail_prompt click or user-typed) plus the current
 * transcript, streams the Groq response back token-by-token.
 *
 * Thin wrapper only — no business logic, no validation beyond shape check.
 */

import { NextRequest } from 'next/server';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ─── System prompt (CLAUDE.md §5) ─────────────────────────────────────────────

function buildSystemPrompt(transcript: string): string {
  return `You are an AI meeting copilot answering questions for someone in an ongoing meeting.
You have access to their full conversation transcript.

Ground rules:
- If the answer is in the transcript, cite it explicitly (quote the speaker, timestamp).
- If you're inferring beyond what's said, flag it: "Based on context, I'd infer..."
- If you don't know, say so. Do not confabulate meeting content.
- Keep answers focused — the person is mid-meeting, not writing a report.

## Current meeting transcript:
${transcript}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (
    body === null ||
    typeof body !== 'object' ||
    !('message' in body) ||
    typeof (body as Record<string, unknown>).message !== 'string' ||
    !('transcript' in body) ||
    typeof (body as Record<string, unknown>).transcript !== 'string'
  ) {
    return new Response(
      JSON.stringify({ error: 'Request must include message (string) and transcript (string)' }),
      { status: 400 },
    );
  }

  const { message, transcript, groqApiKey: clientKey } =
    body as { message: string; transcript: string; groqApiKey?: unknown };

  const apiKey =
    process.env.GROQ_API_KEY ??
    (typeof clientKey === 'string' ? clientKey : undefined);

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'No Groq API key. Set GROQ_API_KEY in .env.local.' }),
      { status: 500 },
    );
  }

  // Forward to Groq with stream: true
  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        stream: true,
        max_tokens: 1024,
        temperature: 0.4,
        messages: [
          { role: 'system', content: buildSystemPrompt(transcript) },
          { role: 'user',   content: message },
        ],
      }),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Groq network error: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 502 },
    );
  }

  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => 'unknown');
    return new Response(
      JSON.stringify({ error: `Groq error ${groqRes.status}: ${detail}` }),
      { status: groqRes.status },
    );
  }

  // Pipe Groq's SSE stream directly to the client.
  // First token visible < 1s (CLAUDE.md §2 latency targets).
  return new Response(groqRes.body, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no', // disable nginx buffering if present
    },
  });
}