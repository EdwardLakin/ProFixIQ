"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/features/shared/lib/supabase/client";

export default function AccountPlanPanel() {
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserPlan = async () => {
      const supabase = supabaseBrowser;

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (user) {
        if (user.email) setEmail(user.email);

        const { data: planData, error: planError } = await supabase
          .from("user_plans")
          .select("plan")
          .eq("user_id", user.id)
          .maybeSingle();

        if (planData?.plan) {
          setPlan(planData.plan);
        } else if (planError) {
          console.error("Error fetching plan:", planError.message);
        }
      } else if (userError) {
        console.error("Error fetching user:", userError.message);
      }
    };

    fetchUserPlan();
  }, []);

  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-black/30 p-6 text-white shadow-card backdrop-blur-xl">
      <h2 className="mb-2 text-lg font-semibold text-white">Account &amp; Plan</h2>
      <div className="mb-2 text-sm text-neutral-400">
        Logged in as: {email || "Loading..."}
      </div>
      <div className="mt-2 text-sm text-neutral-300">
        <span className="font-medium text-neutral-400">Current Plan: </span>
        <span className="font-semibold text-[var(--accent-copper-light)]">
          {plan || "Loading..."}
        </span>
      </div>
      <button
        className="mt-4 inline-flex items-center justify-center rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
        onClick={() => (window.location.href = "/account")}
      >
        Manage Account
      </button>
    </div>
  );
}
