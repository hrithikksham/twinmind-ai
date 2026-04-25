'use client';

import React, { memo, useCallback } from 'react';
import type { Suggestion } from '../utils/validators';

interface Props {
  suggestion: Suggestion;
  onSuggestionClick: (s: Suggestion) => void;
  dimmed?: boolean;
}

export const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  onSuggestionClick,
  dimmed = false,
}: Props) {
  const handleClick = useCallback(() => {
    onSuggestionClick(suggestion);
  }, [suggestion, onSuggestionClick]);

  return (
    <button
      onClick={handleClick}
      className="w-full text-left border rounded-lg px-3 py-2 hover:bg-gray-50 transition"
      style={{ opacity: dimmed ? 0.5 : 1 }}
      title={suggestion.concrete_anchor}
    >
      <div className="text-[11px] uppercase text-gray-500 mb-1">
        {suggestion.type}
      </div>

      <div className="text-[13px] text-gray-800">
        {suggestion.preview}
      </div>

      <div className="text-[11px] text-gray-400 mt-1 truncate">
        re: "{suggestion.concrete_anchor}"
      </div>
    </button>
  );
});