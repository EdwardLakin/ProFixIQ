// useFeatureRead hook
"use client";
import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export function useFeatureRead(featureSlug: string) {
  useEffect(() => {
    const supabase = createClientComponentClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
      await supabase.from("feature_reads").upsert({
        user_id: user.id, feature_slug: featureSlug, last_read_at: new Date().toISOString()
      });
    })();
  }, [featureSlug]);
}