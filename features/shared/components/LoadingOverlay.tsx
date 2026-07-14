// src/components/LoadingOverlay.tsx

"use client";

export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-[color:var(--theme-text-primary)] text-lg font-semibold">Analyzing with AI...</p>
      </div>
    </div>
  );
}
