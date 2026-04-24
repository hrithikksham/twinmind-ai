// src/components/SettingsModal.tsx

'use client';

import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { apiKey, setApiKey } = useSettingsStore();

  const [localKey, setLocalKey] = useState(apiKey || '');

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(localKey.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md rounded-xl p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Groq API Key
          </label>
          <input
            type="password"
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            placeholder="Enter your Groq API key"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}