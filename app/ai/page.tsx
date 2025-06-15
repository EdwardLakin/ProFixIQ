"use client";

import React from "react";
import Link from "next/link";

export default function AIDashboardPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧠 ProFixIQ AI Tools</h1>
      <p className="mb-6 text-muted-foreground">
        Choose an AI-powered tool to assist your diagnostics.
      </p>

      <div className="grid gap-4">
        <Link
          href="/ai/dtc"
          className="block p-4 rounded-lg shadow bg-muted hover:bg-muted/80 transition"
        >
          <h2 className="text-lg font-semibold">🔍 DTC Code Lookup</h2>
          <p className="text-sm text-muted-foreground">
            Enter a diagnostic trouble code (e.g. P0171) and get repair
            insights.
          </p>
        </Link>

        <Link
          href="/ai/chat"
          className="block p-4 rounded-lg shadow bg-muted hover:bg-muted/80 transition"
        >
          <h2 className="text-lg font-semibold">💬 TechBot Assistant</h2>
          <p className="text-sm text-muted-foreground">
            Ask general repair questions and get live AI answers.
          </p>
        </Link>

        <Link
          href="/ai/photo"
          className="block p-4 rounded-lg shadow bg-muted hover:bg-muted/80 transition"
        >
          <h2 className="text-lg font-semibold">📸 Visual Diagnosis</h2>
          <p className="text-sm text-muted-foreground">
            Upload a photo of a broken part for instant repair suggestions.
          </p>
        </Link>
      </div>
    </div>
  );
}
