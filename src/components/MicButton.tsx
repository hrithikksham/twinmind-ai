/**
 * MicButton.tsx 
 */

import React from 'react';

interface MicButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ isRecording, onStart, onStop }: MicButtonProps) {
  return (
    <button
      onClick={isRecording ? onStop : onStart}
      aria-pressed={isRecording}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      title={isRecording ? 'Stop recording' : 'Start recording'}
      className="relative flex items-center justify-center"
    >
      {/* Subtle glow */}
      {isRecording && (
        <span className="absolute w-10 h-10 rounded-full bg-red-500/20 blur-md" />
      )}

      {/* Button */}
      <div
        className={`
          relative z-10
          w-9 h-9 rounded-full
          flex items-center justify-center
          transition-all duration-200
          ${
            isRecording
              ? 'bg-red-500 shadow-sm scale-[1.05]'
              : 'bg-gray-900 hover:bg-black'
          }
        `}
      >
        {/* Mic Icon (SVG) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 10a7 7 0 01-14 0M12 17v4M8 21h8"
          />
        </svg>
      </div>
    </button>
  );
}