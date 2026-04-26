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

// ─── Constants ────────────────────────────────────────────────────────────────

const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ─── Request schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  systemPrompt: z.string().min(1),
  userPrompt:   z.string().min(1),
  // Client may pass its own key (from settingsStore override); server key takes precedence.
  groqApiKey:  z.string().optional(),
  maxTokens:   z.number().int().positive().default(1024),
  // When true, sets response_format: { type: 'json_object' } on the Groq request.
  // Prevents code-fence wrapping at the source — eliminates the most common Gate 1 failures.
  // Must be false / omitted for plain-text calls (e.g. the rolling summary).
  expectJson:  z.boolean().default(false),
});

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse + validate request body
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

  const { systemPrompt, userPrompt, groqApiKey: clientKey, maxTokens, expectJson } = parsed.data;

  // 2. Resolve API key — server env takes precedence over client-supplied override
  const apiKey = process.env.GROQ_API_KEY ?? clientKey;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No Groq API key configured. Set GROQ_API_KEY in .env.local or provide it in Settings.',
      },
      { status: 500 },
    );
  }

  // 3. Forward to Groq
  let groqResponse: Response;
  try {
    groqResponse = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      GROQ_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        // Instructs Groq to output valid JSON with no markdown wrapping.
        // Only applied when the caller explicitly opts in — plain-text calls
        // (e.g. the rolling summary) must not set this or the model will
        // JSON-encode its plain-text output.
        ...(expectJson ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Groq API network error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // 4. Map Groq error codes to meaningful HTTP statuses for our clients.
  //    Do NOT blindly forward Groq's status:
  //      - 401/403 from Groq means OUR key is wrong/expired → our 500 (misconfiguration)
  //      - 429 from Groq means rate-limited → propagate as 429 (client can back off)
  //      - Any other 4xx/5xx from Groq → 502 (bad gateway; upstream failure)
  if (!groqResponse.ok) {
    const errText = await groqResponse.text().catch(() => 'unknown error');
    const status  = mapGroqStatus(groqResponse.status);
    return NextResponse.json(
      { error: `Groq API error ${groqResponse.status}: ${errText}` },
      { status },
    );
  }

  // 5. Parse Groq response — extract only the content string.
  //    Validation of what's IN the string is the service layer's responsibility.
  let groqData: unknown;
  try {
    groqData = await groqResponse.json();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Groq response JSON' },
      { status: 502 },
    );
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

/**
 * Maps Groq upstream HTTP status codes to appropriate codes for our API clients.
 *
 * 401 / 403 — bad or revoked API key; this is our server misconfiguration → 500
 * 429       — rate limited; propagate so the client can implement back-off → 429
 * everything else (422, 5xx, …) → 502 Bad Gateway
 */
function mapGroqStatus(groqStatus: number): number {
  if (groqStatus === 429) return 429;
  if (groqStatus === 401 || groqStatus === 403) return 500;
  return 502;
}

/**
 * Drills into the standard OpenAI-compatible response shape to extract the
 * assistant message content string.
 *
 * Uses optional chaining instead of manual `'key' in obj` guards — shorter,
 * harder to misread, and no less type-safe given the `unknown` input type.
 */
function extractContent(data: unknown): string | null {
  const content = (
    data as
      | { choices?: Array<{ message?: { content?: unknown } }> }
      | null
      | undefined
  )?.choices?.[0]?.message?.content;

  return typeof content === 'string' && content.length > 0 ? content : null;
}