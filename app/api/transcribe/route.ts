/**
 * /api/transcribe/route.ts
 *
 * Accepts an audio file, forwards to Groq Whisper Large V3,
 * returns transcript text.
 */

import { NextRequest, NextResponse } from 'next/server';

const GROQ_TRANSCRIPTION_URL =
  'https://api.groq.com/openai/v1/audio/transcriptions';

const WHISPER_MODEL = 'whisper-large-v3';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ─── Parse multipart form ──────────────────────────────────────────────
  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse form data' },
      { status: 400 }
    );
  }

  // ─── Debug (remove later) ──────────────────────────────────────────────
  console.log('FORM KEYS:', Array.from(formData.keys()));

  // ─── Get audio file ────────────────────────────────────────────────────
  const audioFile = formData.get('file');

  if (!audioFile || typeof audioFile === 'string') {
    return NextResponse.json(
      {
        error: 'Missing or invalid audio file',
        keys: Array.from(formData.keys()),
      },
      { status: 400 }
    );
  }

  // ─── Resolve API key ───────────────────────────────────────────────────
  const clientKey = formData.get('groqApiKey');

  const apiKey =
    process.env.GROQ_API_KEY ??
    (typeof clientKey === 'string' ? clientKey : undefined);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Groq API key configured' },
      { status: 500 }
    );
  }

  // ─── Build Groq request ────────────────────────────────────────────────
  const groqForm = new FormData();

  // ✅ FIX: pass file directly (no casting, no renaming)
  groqForm.append('file', audioFile);
  groqForm.append('model', WHISPER_MODEL);
  groqForm.append('response_format', 'json');

  let groqRes: Response;

  try {
    groqRes = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: groqForm,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Groq network error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 }
    );
  }

  if (!groqRes.ok) {
  const detail = await groqRes.text().catch(() => 'unknown');

  console.error('GROQ ERROR:', groqRes.status, detail);

  return NextResponse.json(
    { error: `Groq Whisper error ${groqRes.status}: ${detail}` },
    { status: groqRes.status }
  );
}

  // ─── Handle API error ──────────────────────────────────────────────────
  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => 'unknown');

    return NextResponse.json(
      {
        error: `Groq Whisper error ${groqRes.status}: ${detail}`,
      },
      { status: groqRes.status }
    );
  }

  // ─── Parse response ────────────────────────────────────────────────────
  let data: unknown;

  try {
    data = await groqRes.json();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse Groq response' },
      { status: 502 }
    );
  }

  const text =
    data &&
    typeof data === 'object' &&
    'text' in data &&
    typeof (data as Record<string, unknown>).text === 'string'
      ? (data as Record<string, unknown>).text
      : '';

  return NextResponse.json({ text });
}