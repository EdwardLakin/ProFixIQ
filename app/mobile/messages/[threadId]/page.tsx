"use client";

import React from "react";

type Props = {
  params: { threadId: string };
};

export default function MobileMessageThreadPage({ params }: Props) {
  const { threadId } = params;

  // TODO: Replace with MobileThreadView (chat-style UI).
  return (
    <main className="min-h-screen px-4 py-3 space-y-3">
      <h1 className="text-lg font-semibold">Conversation</h1>
      <p className="text-xs text-muted-foreground mb-2">
        Thread ID: {threadId}
      </p>
      <p className="text-sm text-muted-foreground">
        This will show a chat-style message thread along with quick actions (attach photo, link to work order, etc.).
      </p>
    </main>
  );
}
