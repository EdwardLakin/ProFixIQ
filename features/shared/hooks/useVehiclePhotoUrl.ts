"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signVehiclePhotoPaths } from "@/features/shared/lib/storage/vehiclePhotoBuckets";

type VehiclePhotoSupabase = Pick<SupabaseClient, "from" | "storage">;

/**
 * Newest usable vehicle_media photo for one vehicle, signed for display.
 *
 * "Usable" means a non-blank storage_path: the column permits an empty or
 * whitespace-only value, and a stray one must not shadow an older real
 * photo. The canonical board view (v_work_order_board_cards_shop/fleet)
 * filters the same way with `nullif(btrim(storage_path), '') is not null`;
 * this fetches a small bounded window and applies the equivalent check in
 * JS rather than relying on a single-row limit picking the newest row
 * regardless of whether it's usable.
 *
 * Renews before the signed URL expires rather than only re-fetching when
 * the vehicle changes: a page can stay mounted well past the TTL, and a
 * browser can re-request an already-rendered <img> at any time -- for
 * example after evicting a background tab's decoded image -- so a URL
 * minted once per vehicle would eventually go stale under someone's
 * cursor with nothing to refresh it.
 */
export function useVehiclePhotoUrl(
  supabase: VehiclePhotoSupabase,
  vehicleId: string | null | undefined,
  ttlSeconds: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const { data: media, error: mediaError } = await supabase
        .from("vehicle_media")
        .select("storage_path,created_at")
        .eq("vehicle_id", vehicleId)
        .eq("type", "photo")
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;

      const path = (media ?? [])
        .map((row) => row.storage_path?.trim())
        .find((candidate): candidate is string => Boolean(candidate));
      if (mediaError || !path) {
        setUrl(null);
        return;
      }

      const signedByPath = await signVehiclePhotoPaths(
        supabase,
        [path],
        ttlSeconds,
      );
      if (cancelled) return;
      setUrl(signedByPath.get(path) ?? null);

      // Floored so a very short TTL (mainly a concern in tests) can't
      // schedule a near-zero, runaway renewal loop.
      const renewInMs = Math.max((ttlSeconds - 60) * 1000, 30_000);
      renewTimer = setTimeout(() => {
        if (!cancelled) void load();
      }, renewInMs);
    };

    void load();

    return () => {
      cancelled = true;
      if (renewTimer) clearTimeout(renewTimer);
    };
  }, [supabase, vehicleId, ttlSeconds]);

  return url;
}
