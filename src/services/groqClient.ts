/**
 * groqClient.ts
 *
 * Shared Groq API client.
 * All routes and services import the model constant and fetch wrapper from here —
 * no direct fetch('/api/...') with hardcoded model strings elsewhere.
 */

// ─── Model ────────────────────────────────────────────────────────────────────

export const GROQ_MODEL = 'gpt-oss-120b' as const;

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

// ─── Client factory ───────────────────────────────────────────────────────────

export interface GroqClientOptions {
  /** API key — server routes pass process.env.GROQ_API_KEY; client hooks pass settingsStore value */
  apiKey: string;
}

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatOptions {
  messages: GroqChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface GroqClient {
  chat: (options: GroqChatOptions) => Promise<Response>;
}

/**
 * Returns a configured client bound to the provided API key.
 * Call once per route handler or service invocation — do not share across requests.
 */
export function createGroqClient({ apiKey }: GroqClientOptions): GroqClient {
  if (!apiKey) {
    throw new GroqConfigError(
      'Groq API key is missing. Set GROQ_API_KEY in .env.local or provide it in Settings.',
    );
  }

  return {
    async chat({ messages, maxTokens = 1024, temperature = 0.3, stream = false }) {
      let response: Response;

      try {
        response = await fetch(`${GROQ_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream,
          }),
        });
      } catch (err) {
        throw new GroqNetworkError(
          `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => 'unknown');
        throw new GroqAPIError(response.status, detail);
      }

      return response;
    },
  };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class GroqConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroqConfigError';
  }
}

export class GroqNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroqNetworkError';
  }
}

export class GroqAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`Groq API error ${status}: ${detail}`);
    this.name = 'GroqAPIError';
  }
}