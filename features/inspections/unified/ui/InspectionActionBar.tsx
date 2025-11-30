"use client";

import React from "react";

type Props = {
  onSave?: () => void;
  onFinish?: () => void;
  onStartVoice?: () => void;
  onStopVoice?: () => void;
  isListening?: boolean;
};

export default function InspectionActionBar({
  onSave,
  onFinish,
  onStartVoice,
  onStopVoice,
  isListening,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
      <div className="font-semibold text-neutral-200">Inspection actions</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="rounded bg-orange-600 px-3 py-1 text-xs text-white"
        >
          Finish
        </button>
        {isListening ? (
          <button
            type="button"
            onClick={onStopVoice}
            className="rounded bg-red-600 px-3 py-1 text-xs text-white"
          >
            Stop voice
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartVoice}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white"
          >
            Start voice
          </button>
        )}
      </div>
    </div>
  );
}
