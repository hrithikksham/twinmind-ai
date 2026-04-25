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
  // ─── State ─────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ─── Stores ────────────────────────────
  const segments = useTranscriptStore((s) => s.segments);
  const batches = useSuggestionStore((s) => s.allBatches);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const contextWindowTokens = useSettingsStore((s) => s.contextWindowTokens);

  // ─── Derived ───────────────────────────
  const getSegments = useCallback(() => segments, [segments]);

  const getTranscript = useCallback(
    () => segments.map((seg) => `[${seg.ts}] ${seg.text}`).join('\n'),
    [segments],
  );

  // ─── Hooks ─────────────────────────────
  const { messages, isLoading, sendMessage, sendSuggestion } = useChat({
    getTranscript,
    groqApiKey,
  });

  const { isRecording, start, stop } = useMicRecorder();

  const { isRefreshing, handleSuggestionClick } = useSuggestions({
    getSegments,
    groqApiKey,
    contextWindowTokens,
    onSuggestionClick: sendSuggestion,
    isRecording,
  });

  return (
    <div className="h-screen flex flex-col bg-[#dfdfdf] text-gray-900 ">
      
      {/* ─── Header ───────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 backdrop-blur-md bg-white/100 border-b border-gray-200 rounded-xl shadow-lg overflow-hidden">
        
        {/* Title */}
        <h1 className="text-[28px] font-semibold tracking-tight">
          TwinMind
        </h1>
      </header>

      {/* ─── Main Layout ───────────────────── */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* Transcript */}
        <div className="flex-[0.9] bg-white/100 backdrop-blur-md rounded-2xl shadow-sm overflow-hidden">
          <TranscriptPanel
            segments={segments}
            isRecording={isRecording}
            onStart={start}
            onStop={stop}
          />
        </div>

        {/* Suggestions */}
        <div className="flex-[1.1] bg-white/80 backdrop-blur-md rounded-2xl shadow-sm overflow-hidden">
          <SuggestionsPanel
            batches={batches}
            isRefreshing={isRefreshing}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>

        {/* Chat */}
        <div className="flex-[1.1] bg-white/80 backdrop-blur-md rounded-2xl shadow-sm overflow-hidden">
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
