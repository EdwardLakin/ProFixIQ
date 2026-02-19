"use client";

import { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COPPER_LIGHT = "var(--accent-copper-light)";

type ReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];
type ReviewInsert = Database["public"]["Tables"]["shop_reviews"]["Insert"];

type Props = {
  shopId: string;
  onCreated?: (newReview: ReviewRow) => void;
};

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden
      style={{
        fill: filled ? "rgba(197,122,74,0.95)" : "rgba(148,163,184,0.25)",
        filter: filled ? "drop-shadow(0 0 10px rgba(197,122,74,0.35))" : "none",
      }}
    >
      <path d="M12 17.3l-5.6 3.4 1.5-6.4L2.7 9.6l6.6-.6L12 3l2.7 6 6.6.6-5.2 4.7 1.5 6.4z" />
    </svg>
  );
}

export default function ReviewForm({ shopId, onCreated }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const stars = useMemo(() => [1, 2, 3, 4, 5], []);

  async function submit() {
    setSubmitting(true);
    setError(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setError("Please sign in to leave a review.");
      setSubmitting(false);
      return;
    }

    const payload: ReviewInsert = {
      shop_id: shopId,
      reviewer_user_id: user.id,
      rating,
      comment: comment.trim() ? comment.trim() : null,
    };

    const { data, error: insErr } = await supabase
      .from("shop_reviews")
      .insert(payload)
      .select("*")
      .single();

    if (insErr) {
      setError(insErr.message);
      setSubmitting(false);
      return;
    }

    if (data) {
      onCreated?.(data);
      setComment("");
      setRating(5);
    }

    setSubmitting(false);
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur-xl"
      style={{
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.04) inset, 0 18px 60px rgba(0,0,0,0.38)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "rgba(197,122,74,0.10)" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 9px)",
        }}
      />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Reviews
            </div>
            <h3 className="mt-1 text-lg font-extrabold text-white">Leave a review</h3>
          </div>

          <span
            className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em]"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(197,122,74,0.10)",
              color: COPPER_LIGHT,
            }}
          >
            Verified
          </span>
        </div>

        <div>
          <div className="text-sm font-semibold text-neutral-200">Rating</div>
          <div className="mt-2 flex items-center gap-1">
            {stars.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRating(s)}
                className="rounded-md p-1 hover:bg-white/5"
                aria-label={`Rate ${s} star${s === 1 ? "" : "s"}`}
              >
                <Star filled={s <= rating} />
              </button>
            ))}
            <div className="ml-2 text-xs text-neutral-400">{rating} / 5</div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-neutral-200">
            Comment <span className="text-neutral-500">(optional)</span>
          </label>
          <textarea
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2"
            style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset" }}
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Short + specific wins. (Example: approvals were faster, less retyping, techs loved the corner grids.)"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-extrabold text-black disabled:opacity-60"
            style={{
              backgroundColor: "rgba(197,122,74,0.95)",
              boxShadow: "0 0 30px rgba(197,122,74,0.25)",
            }}
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>

          <button
            type="button"
            onClick={() => {
              setComment("");
              setRating(5);
              setError(null);
            }}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 py-2 text-sm font-semibold text-neutral-200 hover:border-white/20 hover:bg-black/35 disabled:opacity-60"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}