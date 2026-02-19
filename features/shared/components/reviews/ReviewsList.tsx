"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER = "var(--pfq-copper)";
const COPPER_LIGHT = "var(--accent-copper-light)";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];

type Props = {
  shopId: string;
};

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden
      style={{
        fill: filled ? "rgba(197,122,74,0.95)" : "rgba(148,163,184,0.20)",
        filter: filled ? "drop-shadow(0 0 10px rgba(197,122,74,0.28))" : "none",
      }}
    >
      <path d="M12 17.3l-5.6 3.4 1.5-6.4L2.7 9.6l6.6-.6L12 3l2.7 6 6.6.6-5.2 4.7 1.5 6.4z" />
    </svg>
  );
}

function StarsRow({ rating }: { rating: number }) {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-1" aria-label={`${r} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} filled={i <= r} />
      ))}
    </div>
  );
}

export default function ReviewsList({ shopId }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<string | null>(null);

  const canReply = useMemo(() => {
    if (!me || !me.role || !me.shop_id) return false;
    if (me.shop_id !== shopId) return false;
    return ["owner", "admin", "manager"].includes(me.role);
  }, [me, shopId]);

  const avg = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((a, r) => a + Number(r.rating ?? 0), 0);
    return sum / reviews.length;
  }, [reviews]);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (p) setMe(p);
      }

      const { data } = await supabase
        .from("shop_reviews")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });

      setReviews(data ?? []);
      setLoading(false);
    })();
  }, [shopId, supabase]);

  async function saveReply(id: string, reply: string) {
    setSaving(id);
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("shop_reviews")
      .update({ shop_owner_reply: reply || null, replied_at: nowIso })
      .eq("id", id);

    if (!error) {
      setReviews((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, shop_owner_reply: reply || null, replied_at: nowIso } : r,
        ),
      );
    }

    setSaving(null);
  }

  if (loading) return <div className="text-sm text-neutral-400">Loading reviews…</div>;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/15 p-5 backdrop-blur-xl"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(197,122,74,0.10)" }}
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Shop reviews
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="text-lg font-extrabold text-white">
                {reviews.length === 0 ? "No reviews yet" : avg.toFixed(1)}
              </div>
              {reviews.length > 0 ? <StarsRow rating={avg} /> : null}
              <div className="text-xs text-neutral-400">
                {reviews.length} review{reviews.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <span
            className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(197,122,74,0.10)",
              color: COPPER_LIGHT,
            }}
          >
            Real shops
          </span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="text-sm text-neutral-400">Be the first to leave a review.</div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur-xl"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 9px)",
                }}
              />
              <div className="relative">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <StarsRow rating={Number(r.rating)} />
                    <div className="text-sm font-semibold text-neutral-200">
                      {Number(r.rating).toFixed(1)} / 5
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>

                {r.comment ? (
                  <p className="mt-3 text-sm text-neutral-200">{r.comment}</p>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">
                    (No comment — rating only)
                  </p>
                )}

                {/* Owner reply */}
                {canReply ? (
                  <OwnerReplyBox review={r} onSave={saveReply} saving={saving === r.id} />
                ) : r.shop_owner_reply ? (
                  <div
                    className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4"
                    style={{
                      boxShadow: "0 0 0 1px rgba(197,122,74,0.06) inset",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                        Owner reply
                      </div>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: COPPER,
                          boxShadow: "0 0 18px rgba(197,122,74,0.45)",
                        }}
                        aria-hidden
                      />
                    </div>
                    <p className="mt-2 text-sm text-neutral-200">{r.shop_owner_reply}</p>
                    {r.replied_at ? (
                      <div className="mt-2 text-xs text-neutral-500">
                        {new Date(r.replied_at).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerReplyBox({
  review,
  onSave,
  saving,
}: {
  review: ReviewRow;
  onSave: (id: string, reply: string) => Promise<void>;
  saving: boolean;
}) {
  const [val, setVal] = useState<string>(review.shop_owner_reply ?? "");

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
          Owner reply
        </div>
        <span
          className="text-[11px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: COPPER_LIGHT }}
        >
          {saving ? "Saving…" : "Reply"}
        </span>
      </div>

      <textarea
        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2"
        rows={2}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Keep it short, specific, and helpful."
        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset" }}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void onSave(review.id, val)}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-extrabold text-black disabled:opacity-60"
          style={{
            backgroundColor: "rgba(197,122,74,0.95)",
            boxShadow: "0 0 28px rgba(197,122,74,0.22)",
          }}
        >
          {saving ? "Saving…" : "Save reply"}
        </button>

        <button
          type="button"
          onClick={() => setVal(review.shop_owner_reply ?? "")}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-white/20 hover:bg-black/35 disabled:opacity-60"
        >
          Reset
        </button>
      </div>
    </div>
  );
}