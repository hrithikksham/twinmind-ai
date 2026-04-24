/**
 * /api/transcribe/route.ts
 *
 * Accepts an audio blob, forwards to Groq Whisper Large V3, returns transcript text.
 * Thin wrapper — no business logic.
 */

import { NextRequest, NextResponse } from 'next/server';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse multipart form — audio blob + optional client API key
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 });
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ error: 'Missing audio field (expected Blob)' }, { status: 400 });
  }

  // Server key takes precedence; client key is settings override fallback
  const clientKey = formData.get('groqApiKey');
  const apiKey =
    process.env.GROQ_API_KEY ??
    (typeof clientKey === 'string' ? clientKey : undefined);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Groq API key configured. Set GROQ_API_KEY in .env.local.' },
      { status: 500 },
    );
  }

  // Forward to Groq Whisper
  const groqForm = new FormData();
  groqForm.append('file', audioFile, 'audio.webm');
  groqForm.append('model', WHISPER_MODEL);
  groqForm.append('response_format', 'json');

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Groq network error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => 'unknown');
    return NextResponse.json(
      { error: `Groq Whisper error ${groqRes.status}: ${detail}` },
      { status: groqRes.status },
    );
  }

  let body: unknown;
  try {
    body = await groqRes.json();
  } catch {
    return NextResponse.json({ error: 'Failed to parse Groq response' }, { status: 502 });
  }

  // Whisper returns { text: "..." }
  const text =
    body !== null &&
    typeof body === 'object' &&
    'text' in body &&
    typeof (body as Record<string, unknown>).text === 'string'
      ? (body as Record<string, unknown>).text
      : '';

  return NextResponse.json({ text });
}