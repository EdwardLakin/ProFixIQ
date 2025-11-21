"use client";

import React from "react";

type Props = {
  params: { id: string };
};

export default function MobileInspectionPage({ params }: Props) {
  const { id } = params;

  // TODO: Replace with MobileInspectionForm using corner grids, voice, photos, etc.
  return (
    <main className="min-h-screen px-4 py-3 space-y-3">
      <h1 className="text-lg font-semibold">Inspection #{id}</h1>
      <p className="text-sm text-muted-foreground">
        This will host the mobile inspection experience (voice-driven, corner grids, measurements,
        photos, and signatures).
      </p>
    </main>
  );
}
