"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = {
  personId: string;
  personName: string;
  certificationId: string;
  name: string | null;
  expiresAt: string | null;
  status: "expired" | "expiring_soon" | "active";
  href: string;
};

type Payload = {
  summary: {
    expired: number;
    expiringSoon: number;
    active: number;
    peopleAtRisk: number;
  };
  items: Item[];
  generatedAt: string;
};

export default function WorkforceCertificationsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          "/api/workforce/certifications-readiness",
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as Payload & { error?: string };
        if (!response.ok)
          throw new Error(payload.error || "Unable to load certifications.");
        setData(payload);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load certifications.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grouped = useMemo(
    () => ({
      expired: (data?.items ?? []).filter((item) => item.status === "expired"),
      expiring: (data?.items ?? []).filter(
        (item) => item.status === "expiring_soon",
      ),
      active: (data?.items ?? []).filter((item) => item.status === "active"),
    }),
    [data],
  );

  const renderSection = (label: string, rows: Item[]) => (
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
      <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
        {label}
      </h2>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
            No certifications in this state right now.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.certificationId}
              className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              <div>
                <div className="font-medium text-[color:var(--theme-text-primary)]">
                  {row.name ?? "Certification"}
                </div>
                <div className="text-sm text-[color:var(--theme-text-secondary)]">
                  {row.personName}
                </div>
                <div className="text-xs text-[color:var(--theme-text-secondary)]">
                  Expires:{" "}
                  {row.expiresAt
                    ? new Date(row.expiresAt).toLocaleDateString()
                    : "—"}
                </div>
              </div>
              <Link
                href={row.href}
                className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--theme-accent-text)]"
              >
                Edit
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-[color:var(--theme-text-secondary)]">
        Loading certification readiness…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-[color:var(--theme-danger-text)]">
        {error ?? "Certification readiness is unavailable."}
      </div>
    );
  }

  const metrics = [
    ["Expired", data.summary.expired],
    ["Expiring soon", data.summary.expiringSoon],
    ["Active", data.summary.active],
    ["People at risk", data.summary.peopleAtRisk],
  ] as const;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Certifications
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          See renewal risk, expired credentials, and the people who need
          follow-up.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
          >
            <p className="text-xs text-[color:var(--theme-text-secondary)]">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
              {value}
            </p>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {renderSection("Expired", grouped.expired)}
        {renderSection("Expiring soon", grouped.expiring)}
      </div>
      {renderSection("Active", grouped.active)}
    </div>
  );
}
