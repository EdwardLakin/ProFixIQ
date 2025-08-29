"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type ReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];
type ReviewInsert = Database["public"]["Tables"]["shop_reviews"]["Insert"];

type Props = {
  shopId: string;
  onCreated?: (newReview: ReviewRow) => void;
};

export default function ReviewForm({ shopId, onCreated }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
    } else if (data) {
      onCreated?.(data);
      setComment("");
      setRating(5);
    }
    setSubmitting(false);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
      <h3 className="font-semibold text-lg">Leave a review</h3>

      <label className="block text-sm">Rating</label>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        className="w-full"
      />
      <div className="text-sm text-neutral-400">{rating} / 5</div>

      <label className="block text-sm">Comment (optional)</label>
      <textarea
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit review"}
      </button>
    </div>
  );
}