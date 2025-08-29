"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];

type Props = {
  shopId: string;
};

export default function ReviewsList({ shopId }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<string | null>(null); // review id being saved

  const canReply = useMemo(() => {
    if (!me || !me.role || !me.shop_id) return false;
    if (me.shop_id !== shopId) return false;
    return ["owner", "admin", "manager"].includes(me.role);
  }, [me, shopId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      // me (to gate reply UI)
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
    const { error } = await supabase
      .from("shop_reviews")
      .update({ shop_owner_reply: reply || null, replied_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, shop_owner_reply: reply || null, replied_at: new Date().toISOString() } : r)),
      );
    }
    setSaving(null);
  }

  if (loading) return <div className="text-sm text-neutral-400">Loading reviews…</div>;

  if (reviews.length === 0) {
    return <div className="text-sm text-neutral-400">No reviews yet.</div>;
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Rating: {Number(r.rating).toFixed(1)} / 5</div>
            <div className="text-xs text-neutral-400">
              {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}

          {/* Owner reply */}
          {canReply ? (
            <OwnerReplyBox
              review={r}
              onSave={saveReply}
              saving={saving === r.id}
            />
          ) : r.shop_owner_reply ? (
            <div className="mt-3 rounded bg-neutral-900 p-2 text-sm">
              <div className="font-medium">Owner reply</div>
              <p>{r.shop_owner_reply}</p>
              {r.replied_at && (
                <div className="text-xs text-neutral-500 mt-1">
                  {new Date(r.replied_at).toLocaleString()}
                </div>
              )}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
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
    <div className="mt-3 space-y-2">
      <label className="block text-sm font-medium">Owner reply</label>
      <textarea
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        rows={2}
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      <button
        onClick={() => onSave(review.id, val)}
        disabled={saving}
        className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save reply"}
      </button>
    </div>
  );
}