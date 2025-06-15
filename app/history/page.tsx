"use client";

import React from "react";

type RepairLine = {
  complaint: string;
  cause?: string;
  correction?: string;
  tools?: string[];
  labor_time?: string;
};

export default function RepairResultsViewer({
  results,
}: {
  results: RepairLine[];
}) {
  if (!results || results.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto mt-6 p-6 bg-surface text-accent shadow-card rounded space-y-4">
      <h2 className="text-xl font-semibold">Repair Results</h2>

      {results.map((line, index) => (
        <div
          key={index}
          className="border border-muted rounded p-4 bg-muted/10 space-y-2"
        >
          <div>
            <strong>Complaint:</strong> {line.complaint}
          </div>
          {line.cause && (
            <div>
              <strong>Cause:</strong> {line.cause}
            </div>
          )}
          {line.correction && (
            <div>
              <strong>Correction:</strong> {line.correction}
            </div>
          )}
          {line.tools && line.tools.length > 0 && (
            <div>
              <strong>Tools:</strong> {line.tools.join(", ")}
            </div>
          )}
          {line.labor_time && (
            <div>
              <strong>Estimated Labor:</strong> {line.labor_time} hrs
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
