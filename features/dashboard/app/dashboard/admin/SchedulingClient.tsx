"use client";

import React from "react";

export default function SchedulingClient() {
  // TODO: integrate a calendar / shifts table (employees, roles, shift start/end)
  const shifts = [
    { when: "Mon 9–5", role: "Mechanic", name: "Alex" },
    { when: "Mon 9–5", role: "Advisor", name: "Taylor" },
    { when: "Tue 9–5", role: "Mechanic", name: "Riley" },
  ];

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Scheduling</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {shifts.map((s, i) => (
          <div
            key={i}
            className="rounded border border-neutral-800 bg-neutral-900/40 p-3"
          >
            <div className="text-sm opacity-80">{s.when}</div>
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs opacity-60">{s.role}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button className="px-3 py-2 rounded bg-orange-600 text-black">
          Create Shift
        </button>
        <button className="px-3 py-2 rounded border border-neutral-700 bg-neutral-800">
          Import Calendar
        </button>
      </div>
    </div>
  );
}