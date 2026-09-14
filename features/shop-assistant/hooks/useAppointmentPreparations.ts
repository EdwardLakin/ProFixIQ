"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  AppointmentPreparationListItem,
  AppointmentPreparationsResponse,
} from "@/features/operations/types/appointmentPreparations";

// Appointment preparation is refreshed hourly server-side (see
// vercel.json's /api/internal/appointment-preparations cron), so polling
// faster than that would only ever re-fetch identical data. A slower client
// poll than the inbox activity hook's is intentional here.
const REFRESH_INTERVAL_MS = 5 * 60_000;

export function useAppointmentPreparations(refreshToken?: string | number) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canViewPricing, setCanViewPricing] = useState(false);
  const [items, setItems] = useState<AppointmentPreparationListItem[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(
        "/api/shop-assistant/appointment-preparations",
        { cache: "no-store" },
      );
      const json = (await response
        .json()
        .catch(() => null)) as AppointmentPreparationsResponse | null;

      if (!json || json.ok !== true) {
        throw new Error(
          json?.ok === false
            ? json.error
            : "Failed to load appointment preparation",
        );
      }

      setCanViewPricing(json.canViewPricing);
      setItems(json.items);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load appointment preparation",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, refreshToken]);

  return { loading, error, canViewPricing, items, reload: load };
}
