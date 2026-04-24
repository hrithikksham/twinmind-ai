'use client';

import { useCallback } from 'react';

import { TranscriptPanel } from '@/components/TranscriptPanel';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { MicButton } from '@/components/MicButton';

import { useMicRecorder } from '@/hooks/useMicRecorder';
import { useChat } from '@/hooks/useChat';
import { useSuggestions } from '@/hooks/useSuggestions';

import { useTranscriptStore } from '@/store/transcriptStore';
import { useSuggestionStore } from '@/store/suggestionStore';
import { useSettingsStore } from '@/store/settingsStore';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  // ── Store subscriptions ──────────────────────────────────────────────────

  const segments = useTranscriptStore((s) => s.segments);
  const batches = useSuggestionStore((s) => s.allBatches);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const contextWindowTokens = useSettingsStore((s) => s.contextWindowTokens);

  // ── Stable getters (avoid stale closures in hooks) ───────────────────────

  const getSegments = useCallback(() => segments, [segments]);

  const getTranscript = useCallback(
    () => segments.map((seg) => `[${seg.ts}] ${seg.text}`).join('\n'),
    [segments],
  );

  // ── Hooks — order matters: useChat first so sendSuggestion is available ──

  const { messages, isLoading, sendMessage, sendSuggestion } = useChat({
    getTranscript,
    groqApiKey,
  });

  const { isRecording, start, stop } = useMicRecorder();

  const { isRefreshing, handleSuggestionClick } = useSuggestions({
    getSegments,
    contextWindowTokens,
    onSuggestionClick: sendSuggestion,
    isRecording,
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Top bar: title + mic control */}
      <header style={styles.topBar}>
        <h1 style={styles.title}>TwinMind</h1>
        <MicButton isRecording={isRecording} onStart={start} onStop={stop} />
      </header>

      {/* Three-column layout */}
      <div style={styles.columns}>
        {/* Left: transcript feed */}
        <div style={styles.col}>
          <TranscriptPanel segments={segments} />
        </div>

        {/* Middle: suggestion batches */}
        <div style={styles.col}>
          <SuggestionsPanel
            batches={batches}
            isRefreshing={isRefreshing}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>

        {/* Right: chat history + input */}
        <div style={{ ...styles.col, borderRight: 'none' }}>
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSendMessage={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Layout styles ─────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: '#f9fafb',
    fontFamily: 'system-ui, sans-serif',
  },
  topBar: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 16,
    padding: '10px 20px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.01em',
  },
  columns: {
    flex: 1,
    display: 'flex' as const,
    overflow: 'hidden',
  },
  col: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRight: '1px solid #e5e7eb',
    background: '#ffffff',
  },
} as const;