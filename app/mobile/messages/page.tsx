"use client";

import React from "react";

export default function MobileMessagesPage() {
  // TODO: Replace with mobile inbox for shop / work order threads.
  return (
    <main className="min-h-screen px-4 py-3 space-y-3">
      <h1 className="text-lg font-semibold">Messages</h1>
      <p className="text-sm text-muted-foreground">
        This will list conversations (by work order, inspection, or direct messages) for the current user.
      </p>
    </main>
  );
}
