// app/dashboard/reviews/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ReviewForm from "@/features/shared/components/reviews/ReviewForm";
import ReviewsList from "@/features/shared/components/reviews/ReviewsList";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "shop_id" | "role"
>;

export default function ReviewsPage() {
  const supabase = createClientComponentClient<Database>();
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setShopId(null);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, shop_id, role")
        .eq("id", user.id)
        .single<Profile>();

      setShopId((profile?.shop_id as string | null) ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) {
    return <div className="text-sm text-neutral-400">Loading…</div>;
  }

  if (!shopId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-neutral-300">
        You’re not attached to a shop yet.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur-xl">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
          Reviews
        </div>
        <h1
          className="mt-2 text-2xl text-white md:text-3xl"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          Share feedback. Build trust.
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-300">
          Reviews help us improve ProFixIQ and help other shops understand what it’s like in the bay.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewForm shopId={shopId} />
        <div className="rounded-3xl border border-white/10 bg-black/15 p-6 backdrop-blur-xl">
          <div className="text-sm font-semibold text-white">Recent reviews</div>
          <div className="mt-4">
            <ReviewsList shopId={shopId} />
          </div>
        </div>
      </div>
    </div>
  );
}