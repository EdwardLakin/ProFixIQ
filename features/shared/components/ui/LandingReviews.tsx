// features/shared/components/ui/LandingReviews.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

type ReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];

type PublicReview = Pick<
  ReviewRow,
  | "id"
  | "shop_id"
  | "rating"
  | "comment"
  | "created_at"
  | "shop_owner_reply"
  | "replied_at"
>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Stars({ value }: { value: number }) {
  const v = clamp(value, 0, 5);
  const full = Math.floor(v);
  const half = v - full >= 0.5;

  return (
    <div
      className="flex items-center gap-1"
      aria-label={`${v.toFixed(1)} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const idx = i + 1;
        const filled = idx <= full;
        const isHalf = !filled && half && idx === full + 1;

        return (
          <span
            key={idx}
            className="inline-flex h-4 w-4 items-center justify-center"
            aria-hidden
          >
            <span
              className="block h-3.5 w-3.5"
              style={{
                background: filled
                  ? `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 35%, rgba(0,0,0,0) 70%), linear-gradient(135deg, rgba(197,122,74,0.95), rgba(249,115,22,0.85))`
                  : isHalf
                    ? `linear-gradient(90deg, rgba(197,122,74,0.95) 0%, rgba(197,122,74,0.95) 50%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.22) 100%)`
                    : "rgba(148,163,184,0.22)",
                clipPath:
                  "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                boxShadow: filled ? "0 0 18px rgba(197,122,74,0.35)" : "none",
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

function SignalDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: "rgba(197,122,74,0.95)",
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold text-white">{value}</div>
    </div>
  );
}

export default function LandingReviews() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);

      // IMPORTANT:
      // For landing page visibility, you likely want an explicit public-read policy.
      // Until you add an "is_public" flag + policy, this may return 0 rows under RLS.
      const { data, error } = await supabase
        .from("shop_reviews")
        .select("id,shop_id,rating,comment,created_at,shop_owner_reply,replied_at")
        .order("created_at", { ascending: false })
        .limit(8);

      if (!alive) return;

      if (error) {
        // fail closed (don’t leak anything, don’t hard-crash)
        setReviews([]);
        setLoading(false);
        return;
      }

      setReviews((data as PublicReview[]) ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  const stats = useMemo(() => {
    const list = reviews
      .map((r) => Number(r.rating))
      .filter((n) => Number.isFinite(n));

    const count = list.length;
    const avg = count ? list.reduce((a, b) => a + b, 0) / count : 0;

    const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const n of list) {
      const k = clamp(Math.round(n), 1, 5);
      buckets[k] = (buckets[k] ?? 0) + 1;
    }

    return { count, avg, buckets };
  }, [reviews]);

  const distribution = useMemo(() => {
    const total = stats.count || 1;
    const keys = [5, 4, 3, 2, 1] as const;
    return keys.map((k) => ({
      stars: k,
      n: stats.buckets[k] ?? 0,
      pct: ((stats.buckets[k] ?? 0) / total) * 100,
    }));
  }, [stats]);

  return (
    <section className="relative mx-auto max-w-[1400px] overflow-x-hidden px-4 py-16 md:py-20">
      {/* backplate */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 360px at 18% 10%, rgba(197,122,74,0.14), transparent 60%)," +
              "radial-gradient(900px 520px at 78% 90%, rgba(15,23,42,0.70), rgba(2,6,23,1) 60%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 8px)",
          }}
        />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <div
          className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: COPPER_LIGHT }}
        >
          <SignalDot />
          Reviews
        </div>

        <h2
          className="mt-3 text-3xl text-white md:text-5xl"
          style={{
            fontFamily: "var(--font-blackops)",
            textShadow: "0 0 48px rgba(0,0,0,0.75)",
          }}
        >
          Proof from the floor.
        </h2>

        <p className="mx-auto mt-3 max-w-2xl text-sm text-neutral-300 sm:text-base">
          Shops don’t want “more software.” They want less retyping, faster approvals,
          and evidence that follows the job.
        </p>
      </div>

      {/* main card */}
      <div className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="grid gap-0 lg:grid-cols-[420px_1fr]">
          {/* left: stats */}
          <div className="relative border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
              style={{ background: "rgba(197,122,74,0.14)" }}
            />

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Average rating
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-4xl font-extrabold text-white">
                    {stats.count ? stats.avg.toFixed(1) : "—"}
                  </div>
                  <div className="pb-1 text-sm text-neutral-400">/ 5</div>
                </div>

                <div className="mt-2">
                  <Stars value={stats.avg} />
                </div>

                <div className="mt-3 text-sm text-neutral-300">
                  {stats.count
                    ? `${stats.count} review${stats.count === 1 ? "" : "s"}`
                    : "No public reviews yet"}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <StatPill label="Setup speed" value="Day-one ready" />
                <StatPill label="Rollout" value="Phased adoption" />
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {distribution.map((d) => (
                <div key={d.stars} className="flex items-center gap-3">
                  <div className="w-14 text-[11px] font-semibold text-neutral-400">
                    {d.stars} star
                  </div>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${clamp(d.pct, 0, 100)}%`,
                        background:
                          "linear-gradient(90deg, rgba(197,122,74,0.15), rgba(197,122,74,0.85))",
                        boxShadow: "0 0 18px rgba(197,122,74,0.22)",
                      }}
                    />
                  </div>
                  <div className="w-10 text-right text-[11px] text-neutral-400">
                    {d.n}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-neutral-200">
              <span className="font-semibold" style={{ color: COPPER_LIGHT }}>
                If you’re still reading,
              </span>{" "}
              you’re already wasting time. Let ProFixIQ set the shop up for you.
            </div>
          </div>

          {/* right: review cards */}
          <div className="p-6">
            {loading ? (
              <div className="text-sm text-neutral-400">Loading reviews…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-neutral-400">No public reviews yet.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {reviews.map((r) => {
                  const rating = Number(r.rating);

                  return (
                    <div
                      key={r.id}
                      className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/15 p-5"
                    >
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          boxShadow:
                            "0 0 0 1px rgba(255,255,255,0.05) inset, 0 18px 60px rgba(0,0,0,0.35)",
                        }}
                      />

                      <div
                        className="pointer-events-none absolute inset-0 opacity-[0.10]"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(115deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.00) 2px, rgba(0,0,0,0.35) 6px)",
                        }}
                      />

                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-extrabold text-white">
                              Verified shop user
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <Stars value={Number.isFinite(rating) ? rating : 0} />
                              <div className="text-[11px] text-neutral-400">
                                {Number.isFinite(rating) ? rating.toFixed(1) : "—"}
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] text-neutral-400">
                            {formatDate(r.created_at)}
                          </div>
                        </div>

                        {r.comment ? (
                          <p className="mt-3 text-sm leading-relaxed text-neutral-200">
                            {r.comment}
                          </p>
                        ) : (
                          <p className="mt-3 text-sm text-neutral-400">
                            (No written comment)
                          </p>
                        )}

                        {r.shop_owner_reply ? (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div
                                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                                style={{ color: COPPER_LIGHT }}
                              >
                                Owner reply
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                {formatDate(r.replied_at)}
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-neutral-200">
                              {r.shop_owner_reply}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: COPPER }}
              />
              Reviews shown here depend on public visibility policies
              <span className="text-white/10">•</span>
              Evidence-first workflow
              <span className="text-white/10">•</span>
              No paywalls
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </section>
  );
}