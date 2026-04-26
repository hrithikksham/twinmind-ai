'use client';

import { useCallback, useState } from 'react';

import { TranscriptPanel } from '@/components/TranscriptPanel';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import { ChatPanel } from '@/components/ChatPanel';

import { useMicRecorder } from '@/hooks/useMicRecorder';
import { useChat } from '@/hooks/useChat';
import { useSuggestions } from '@/hooks/useSuggestions';

import { useTranscriptStore } from '@/store/transcriptStore';
import { useSuggestionStore } from '@/store/suggestionStore';
import { useSettingsStore } from '@/store/settingsStore';

import SettingsModal from '@/components/SettingsModal';

export default function Page() {
  // ─── Local State ─────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ─── Stores (React-bound for UI rendering) ───
  const segments = useTranscriptStore((s) => s.segments);
  const batches = useSuggestionStore((s) => s.allBatches);

  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const contextWindowTokens = useSettingsStore((s) => s.contextWindowTokens);

  // ─────────────────────────────────────────────
  // ✅ CRITICAL FIX: Use LIVE store access (no stale closure)
  // ─────────────────────────────────────────────
  const getSegments = useCallback(() => {
    return useTranscriptStore.getState().segments;
  }, []);

  // ─── Transcript builder ──────────────────────
  const getTranscript = useCallback(() => {
    const currentSegments = useTranscriptStore.getState().segments;

    return currentSegments
      .map((seg) => `[${seg.ts}] ${seg.text}`)
      .join('\n');
  }, []);

  // ─── Chat Hook ───────────────────────────────
  const { messages, isLoading, sendMessage, sendSuggestion } = useChat({
    getTranscript,
    groqApiKey,
  });

  // ─── Mic Recorder ────────────────────────────
  const { isRecording, start, stop } = useMicRecorder();

  // ─── Suggestions Hook ────────────────────────
  const { isRefreshing, handleSuggestionClick } = useSuggestions({
    getSegments,
    groqApiKey,
    contextWindowTokens,
    onSuggestionClick: sendSuggestion,
    isRecording,
  });

  // ─── Debug (optional, remove later) ──────────
  console.log('[PAGE]', {
    segments: segments.length,
    isRecording,
    batches: batches.length,
  });

  return (
    <div className="h-screen flex flex-col bg-[#dfdfdf] text-gray-900">
      
      {/* ─── Header ───────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        
        <h1 className="text-[24px] font-semibold tracking-tight">
          TwinMind
        </h1>

        {/* Settings Button (you were missing this) */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Settings
        </button>
      </header>

      {/* ─── Main Layout ───────────────────── */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* Transcript */}
        <div className="flex-[0.9] bg-white rounded-2xl shadow-sm overflow-hidden">
          <TranscriptPanel
            segments={segments}
            isRecording={isRecording}
            onStart={start}
            onStop={stop}
          />
        </div>

        {/* Suggestions */}
        <div className="flex-[1.1] bg-white rounded-2xl shadow-sm overflow-hidden">
          <SuggestionsPanel
            batches={batches}
            isRefreshing={isRefreshing}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>

        {/* Chat */}
        <div className="flex-[1.1] bg-white rounded-2xl shadow-sm overflow-hidden">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSendMessage={sendMessage}
          />
        </div>
      </div>

      {/* ─── Settings Modal ───────────────── */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}