'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { groqApiKey, setGroqApiKey } = useSettingsStore();

  const [localKey, setLocalKey] = useState(groqApiKey || '');

  // Sync when opening
  useEffect(() => {
    if (isOpen) {
      setLocalKey(groqApiKey || '');
    }
  }, [isOpen, groqApiKey]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    setGroqApiKey(localKey.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">

      {/* ─── Overlay ───────────────────── */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition"
        onClick={onClose}
      />

      {/* ─── Sheet ─────────────────────── */}
      <div
        className="
          relative w-full sm:max-w-md
          bg-white/90 backdrop-blur-xl
          rounded-t-2xl sm:rounded-2xl
          p-6
          shadow-xl
          animate-[fadeIn_0.2s_ease]
        "
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold tracking-tight">
            Settings
          </h2>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>

        {/* API Key */}
        <div className="mb-6">
          <label className="block text-xs text-gray-500 mb-1">
            Groq API Key
          </label>

          <input
            type="password"
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            placeholder="Enter your API key"
            className="
              w-full px-3 py-2.5
              rounded-lg
              bg-gray-100
              text-sm
              outline-none
              focus:bg-gray-50
              transition
            "
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">

          <button
            onClick={onClose}
            className="
              px-4 py-2 text-sm
              text-gray-600
              hover:text-black
              transition
            "
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="
              px-4 py-2 text-sm
              bg-black text-white
              rounded-lg
              hover:bg-gray-900
              transition
            "
          >
            Save
          </button>

        </div>
      </div>
    </div>
  );
}