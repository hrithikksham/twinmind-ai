import { NextRequest, NextResponse } from 'next/server';

const GROQ_TRANSCRIPTION_URL =
  'https://api.groq.com/openai/v1/audio/transcriptions';

const WHISPER_MODEL = 'whisper-large-v3';

// Minimum viable audio size (~15KB)
const MIN_AUDIO_BYTES = 15_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData;

  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse form data' },
      { status: 400 }
    );
  }

  const audioFile = formData.get('file');

  if (!audioFile || typeof audioFile === 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid audio file' },
      { status: 400 }
    );
  }

  // 🔥 CRITICAL: validate file
  if (audioFile.size < MIN_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: `Audio too small (${audioFile.size} bytes)`,
      },
      { status: 400 }
    );
  }

  if (!audioFile.type.includes('audio')) {
    return NextResponse.json(
      {
        error: `Invalid MIME type: ${audioFile.type}`,
      },
      { status: 400 }
    );
  }

  // ─── API key ─────────────────────────────
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

  // ─── Normalize file (IMPORTANT) ──────────
  const normalizedFile = new File(
    [audioFile],
    'audio.webm', // force extension
    { type: audioFile.type || 'audio/webm' }
  );

  const groqForm = new FormData();
  groqForm.append('file', normalizedFile);
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