"use client";

import { useEffect, useState} from "react";
import { PRICE_IDS } from "@stripe/lib/stripe/constants";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type PlanKey = "free" | "diy" | "pro" | "pro_plus";

export default function PlanSelectionPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [isYearly, setIsYearly] = useState(false);
  const [loading, setLoading] = useState(false);
    const supabase = createClientComponentClient<Database>();

  const router = useRouter();

  const handleCheckout = async (plan: PlanKey) => {
    setSelectedPlan(plan);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert("You must be signed in");
      setLoading(false);
      return;
    }

    if (plan === "free") {
      await supabase.from("profiles").update({ plan }).eq("id", user.id);
      router.push("/onboarding/profile");
      return;
    }

    const priceId = isYearly
      ? PRICE_IDS[plan]?.yearly
      : PRICE_IDS[plan]?.monthly;
    if (!priceId) {
      alert("Invalid plan selected");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planKey: priceId,
        interval: isYearly ? "yearly" : "monthly",
        isAddon: false,
        shopId: profile?.shop_id || null,
        userId: user.id,
      }),
    });

    const { id } = await res.json();
    if (id) {
      window.location.href = `https://checkout.stripe.com/c/pay/${id}`;
    } else {
      alert("Failed to redirect to Stripe");
    }

    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-6xl mx-auto text-center">
        <h1 className="text-4xl font-blackops text-orange-500 mb-6">
          Choose Your Plan
        </h1>
        <p className="text-gray-400 mb-10">
          Unlock AI diagnostics, smart inspections, and streamlined workflows.
        </p>

        <div className="flex justify-center gap-4 mb-10">
          <button
            className={`px-4 py-2 rounded font-blackops ${
              !isYearly
                ? "bg-orange-500 text-black"
                : "bg-neutral-800 text-white"
            }`}
            onClick={() => setIsYearly(false)}
          >
            Monthly
          </button>
          <button
            className={`px-4 py-2 rounded font-blackops ${
              isYearly
                ? "bg-orange-500 text-black"
                : "bg-neutral-800 text-white"
            }`}
            onClick={() => setIsYearly(true)}
          >
            Yearly
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {(
            [
              {
                key: "free",
                name: "Free",
                description: "Try the basics",
                price: "$0",
                features: [
                  "5 AI uses",
                  "No inspections",
                  "1 vehicle",
                  "No support",
                ],
              },
              {
                key: "diy",
                name: "DIY",
                description: "For home users",
                price: isYearly ? "$90/year" : "$9/month",
                features: [
                  "Basic AI",
                  "Limited inspections",
                  "Photo upload",
                  "Email support",
                ],
              },
              {
                key: "pro",
                name: "Pro",
                description: "For solo pros",
                price: isYearly ? "$490/year" : "$49/month",
                features: [
                  "Unlimited AI",
                  "Voice & photo",
                  "PDF export",
                  "1 user",
                ],
              },
              {
                key: "pro_plus",
                name: "Pro+",
                description: "For teams",
                price: isYearly ? "$990/year" : "$99/month",
                features: [
                  "All features",
                  "5 users",
                  "Admin/Tech roles",
                  "+$49/user addon",
                ],
              },
            ] as {
              key: PlanKey;
              name: string;
              description: string;
              price: string;
              features: string[];
            }[]
          ).map((plan) => (
            <button
              key={plan.key}
              onClick={() => handleCheckout(plan.key)}
              disabled={loading}
              className={`p-6 border rounded-xl text-left transition-all hover:bg-neutral-800 ${
                selectedPlan === plan.key
                  ? "border-orange-500 ring-2 ring-orange-500"
                  : "border-neutral-700"
              }`}
            >
              <h2 className="text-xl font-blackops text-orange-400">
                {plan.name}
              </h2>
              <p className="text-sm text-gray-400 mb-2">{plan.description}</p>
              <p className="text-lg text-orange-500 font-bold mb-4">
                {plan.price}
              </p>
              <ul className="text-sm text-gray-300 space-y-1">
                {plan.features.map((feature, i) => (
                  <li key={i}>✓ {feature}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
        <p className="mt-10 text-sm text-gray-500">
          You can upgrade, downgrade, or cancel anytime. Free plan always
          available.
        </p>
      </div>

      {/* Optional floating Ask AI button */}
      <button
        onClick={() => {
          const chatbot = document.getElementById("chatbot-button");
          if (chatbot) chatbot.click();
        }}
        className="fixed bottom-6 right-6 z-50 bg-orange-500 hover:bg-orange-600 text-black font-blackops px-4 py-3 rounded-full shadow-lg transition-all duration-300"
      >
        Ask AI
      </button>
    </div>
  );
}
