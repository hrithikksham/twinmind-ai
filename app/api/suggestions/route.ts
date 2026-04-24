/**
 * /api/suggestions/route.ts
 *
 * Thin Next.js route handler. Responsibilities:
 *   1. Validate request shape
 *   2. Inject GROQ_API_KEY server-side (never exposed to client)
 *   3. Forward to Groq chat completions
 *   4. Return raw model content string
 *
 * Business logic (prompt construction, validation, retry) lives in
 * suggestionService.ts and suggestionPrompt.ts — NOT here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ─── Request schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  // Client may pass its own key (from settingsStore override); server key is fallback
  groqApiKey: z.string().optional(),
  maxTokens: z.number().int().positive().default(1024),
});

// ─── Groq model for suggestion generation ────────────────────────────────────
// CLAUDE.md §2: "Groq OSS 120B" — use the Groq-hosted llama3 70b as proxy
// Update to compound-beta or llama-3.3-70b-versatile per your Groq account access

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse + validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { systemPrompt, userPrompt, groqApiKey: clientKey, maxTokens } = parsed.data;

  // Server-side key takes precedence; client key is fallback for dev/settings override
  const apiKey = process.env.GROQ_API_KEY ?? clientKey;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Groq API key configured. Set GROQ_API_KEY in .env.local or provide it in Settings.' },
      { status: 500 },
    );
  }

  // Forward to Groq
  let groqResponse: Response;
  try {
    groqResponse = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3, // Low temperature: we want deterministic, structured JSON output
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Groq API network error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!groqResponse.ok) {
    const errText = await groqResponse.text().catch(() => 'unknown error');
    return NextResponse.json(
      { error: `Groq API error ${groqResponse.status}: ${errText}` },
      { status: groqResponse.status },
    );
  }

  // Parse Groq response and return only the content string.
  // Validation of what's IN the content string happens in suggestionService — not here.
  let groqData: unknown;
  try {
    groqData = await groqResponse.json();
  } catch {
    return NextResponse.json({ error: 'Failed to parse Groq response JSON' }, { status: 502 });
  }

  const content = extractContent(groqData);
  if (!content) {
    return NextResponse.json(
      { error: 'Groq response missing expected content field' },
      { status: 502 },
    );
  }

  return NextResponse.json({ content });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractContent(data: unknown): string | null {
  if (
    data !== null &&
    typeof data === 'object' &&
    'choices' in data &&
    Array.isArray((data as Record<string, unknown>).choices) &&
    (data as Record<string, unknown[]>).choices.length > 0
  ) {
    const first = (data as Record<string, unknown[]>).choices[0];
    if (
      first !== null &&
      typeof first === 'object' &&
      'message' in (first as object) &&
      typeof ((first as Record<string, unknown>).message) === 'object'
    ) {
      const message = (first as Record<string, Record<string, unknown>>).message;
      if (typeof message.content === 'string') {
        return message.content;
      }
    }
  }
  return null;
}