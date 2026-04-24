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
    contextWindowTokens,
    onSuggestionClick: sendSuggestion,
    isRecording,
  });

  return (
    <div className="h-screen flex flex-col bg-[#dddffd] text-gray-900">
      
      {/* ─── Header ───────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 backdrop-blur-md bg-white/70 border-b border-gray-200">
        
        {/* Title */}
        <h1 className="text-[28px] font-semibold tracking-tight">
          TwinMind
        </h1>

        {/* Settings Button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition hover:scale-105"
        >
          {/* Minimal gear icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-9 h-9 text-gray-700"
            fill="none"
            viewBox="0 0 14 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.983 5.5a1.5 1.5 0 011.034.413l.634.634a1.5 1.5 0 001.06.44h.896a1.5 1.5 0 011.415 1.02l.308.924a1.5 1.5 0 00.364.586l.633.634a1.5 1.5 0 010 2.12l-.633.634a1.5 1.5 0 00-.364.586l-.308.924a1.5 1.5 0 01-1.415 1.02h-.896a1.5 1.5 0 00-1.06.44l-.634.634a1.5 1.5 0 01-2.12 0l-.634-.634a1.5 1.5 0 00-1.06-.44h-.896a1.5 1.5 0 01-1.415-1.02l-.308-.924a1.5 1.5 0 00-.364-.586l-.633-.634a1.5 1.5 0 010-2.12l.633-.634a1.5 1.5 0 00.364-.586l.308-.924A1.5 1.5 0 018.23 7.01h.896a1.5 1.5 0 001.06-.44l.634-.634a1.5 1.5 0 011.034-.413z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15a3 3 0 100-6 3 3 0 000 6z"
            />
          </svg>
        </button>
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