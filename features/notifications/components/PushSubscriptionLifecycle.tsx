"use client";

import { useEffect } from "react";

import { PUSH_SUBSCRIPTION_CHANGED_MESSAGE } from "@/features/notifications/lib/pushClientContracts";
import {
  dropLocalSubscription,
  refreshExistingSubscription,
} from "@/features/notifications/lib/pushClient";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

/**
 * Keeps this device's push subscription aligned with the signed-in account.
 * It never prompts or creates a new subscription: that needs an explicit user
 * action in PushNotificationSettings. On sign-out the subscription is dropped
 * locally so the previous user stops receiving alerts on this device.
 */
export default function PushSubscriptionLifecycle() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const supabase = createBrowserSupabase();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void dropLocalSubscription();
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void refreshExistingSubscription().catch(() => undefined);
      }
    });
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === PUSH_SUBSCRIPTION_CHANGED_MESSAGE) {
        void dropLocalSubscription();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      data.subscription.unsubscribe();
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
