"use client";



type Team = { name: string; members: number; lead?: string | null };

export default function TeamsClient() {
  // TODO: load from your teams table & members count
  const teams: Team[] = [
    { name: "Front Desk", members: 3, lead: "Casey" },
    { name: "Lifts A", members: 4, lead: "Jordan" },
    { name: "Diagnostics", members: 2, lead: null },
  ];

  return (
    <div className="p-6 text-[color:var(--theme-text-primary)]">
      <h1 className="text-2xl font-bold mb-4">Teams</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <div
            key={t.name}
            className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
          >
            <div className="text-lg font-semibold">{t.name}</div>
            <div className="text-sm opacity-70 mt-1">
              {t.members} member{t.members === 1 ? "" : "s"}
            </div>
            <div className="text-sm opacity-70">
              Lead: {t.lead ?? "—"}
            </div>

            <div className="mt-3 flex gap-2">
              <button className="px-3 py-1 rounded bg-orange-600 text-[color:var(--theme-text-on-accent)]">
                Manage
              </button>
              <button className="px-3 py-1 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)]">
                Add Member
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-4 px-3 py-2 rounded bg-[color:var(--theme-surface-panel-strong)] border border-[color:var(--theme-border-soft)]">
        Create Team
      </button>
    </div>
  );
}