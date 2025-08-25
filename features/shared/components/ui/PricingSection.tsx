// shared/components/ui/PricingSection.tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PRICE_IDS } from "@stripe/lib/stripe/constants"; // keep if you already have this

export type CheckoutPayload = {
  priceId: string;                 // Stripe price_...
  interval: "monthly" | "yearly";
};

type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
};

export default function PricingSection({
  onCheckout,
  onStartFree,
}: PricingSectionProps) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  // If you don't use PRICE_IDS, you can hardcode your price IDs here:
  // const PRICE_IDS = {
  //   diy: { monthly: "price_xxx", yearly: "price_xxx" },
  //   pro: { monthly: "price_xxx", yearly: "price_xxx" },
  //   pro_plus: { monthly: "price_xxx", yearly: "price_xxx" },
  // };

  const pick = (key: keyof typeof PRICE_IDS) =>
    interval === "yearly" ? PRICE_IDS[key].yearly : PRICE_IDS[key].monthly;

  return (
    <div className="w-full">
      {/* Toggle */}
      <div className="flex justify-center gap-2 mb-6">
        <button
          onClick={() => setInterval("monthly")}
          aria-pressed={interval === "monthly"}
          className={`px-4 py-2 rounded font-black ${
            interval === "monthly"
              ? "bg-orange-500 text-black"
              : "bg-neutral-800 text-neutral-300"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval("yearly")}
          aria-pressed={interval === "yearly"}
          className={`px-4 py-2 rounded font-black ${
            interval === "yearly"
              ? "bg-orange-500 text-black"
              : "bg-neutral-800 text-neutral-300"
          }`}
        >
          Yearly
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Free */}
        <div className="rounded-xl border border-orange-500/60 bg-neutral-900 p-6">
          <h3 className="text-xl" style={{ fontFamily: "var(--font-blackops)" }}>
            Free
          </h3>
          <p className="text-sm text-neutral-400 mb-3">Try the basics</p>
          <p className="text-lg text-orange-500 font-bold mb-4">$0</p>
          <ul className="text-sm text-neutral-300 space-y-1 mb-6">
            <li><Check className="inline mr-2" size={16}/>5 AI uses</li>
            <li><Check className="inline mr-2" size={16}/>1 vehicle</li>
            <li><Check className="inline mr-2" size={16}/>Email support (community)</li>
          </ul>
          <button
            onClick={onStartFree}
            className="w-full rounded bg-neutral-800 hover:bg-neutral-700 py-3 font-semibold"
          >
            Get Started Free
          </button>
        </div>

        {/* DIY */}
        <div className="rounded-xl border border-orange-500/60 bg-neutral-900 p-6">
          <h3 className="text-xl" style={{ fontFamily: "var(--font-blackops)" }}>
            DIY
          </h3>
          <p className="text-sm text-neutral-400 mb-3">For home users</p>
          <p className="text-lg text-orange-500 font-bold mb-4">
            {interval === "yearly" ? "$90/year" : "$9/month"}
          </p>
          <ul className="text-sm text-neutral-300 space-y-1 mb-6">
            <li><Check className="inline mr-2" size={16}/>Core AI</li>
            <li><Check className="inline mr-2" size={16}/>Limited inspections</li>
            <li><Check className="inline mr-2" size={16}/>Photo upload</li>
          </ul>
          <button
            onClick={() =>
              onCheckout({ priceId: pick("diy"), interval })
            }
            className="w-full rounded bg-orange-500 hover:bg-orange-600 text-black py-3 font-bold"
          >
            Start Checkout
          </button>
        </div>

        {/* Pro */}
        <div className="rounded-xl border border-orange-500/60 bg-neutral-900 p-6">
          <h3 className="text-xl" style={{ fontFamily: "var(--font-blackops)" }}>
            Pro
          </h3>
          <p className="text-sm text-neutral-400 mb-3">For solo pros</p>
          <p className="text-lg text-orange-500 font-bold mb-4">
            {interval === "yearly" ? "$490/year" : "$49/month"}
          </p>
          <ul className="text-sm text-neutral-300 space-y-1 mb-6">
            <li><Check className="inline mr-2" size={16}/>Unlimited AI</li>
            <li><Check className="inline mr-2" size={16}/>Voice & photo</li>
            <li><Check className="inline mr-2" size={16}/>PDF export</li>
            <li><Check className="inline mr-2" size={16}/>1 user</li>
          </ul>
          <button
            onClick={() =>
              onCheckout({ priceId: pick("pro"), interval })
            }
            className="w-full rounded bg-orange-500 hover:bg-orange-600 text-black py-3 font-bold"
          >
            Start Checkout
          </button>
        </div>

        {/* Pro+ */}
        <div className="rounded-xl border border-orange-500/60 bg-neutral-900 p-6">
          <h3 className="text-xl" style={{ fontFamily: "var(--font-blackops)" }}>
            Pro+
          </h3>
          <p className="text-sm text-neutral-400 mb-3">For teams</p>
          <p className="text-lg text-orange-500 font-bold mb-4">
            {interval === "yearly" ? "$990/year" : "$99/month"}
          </p>
          <ul className="text-sm text-neutral-300 space-y-1 mb-6">
            <li><Check className="inline mr-2" size={16}/>All features</li>
            <li><Check className="inline mr-2" size={16}/>5 users</li>
            <li><Check className="inline mr-2" size={16}/>Admin/Tech roles</li>
            <li><Check className="inline mr-2" size={16}/>+$49/user add-on</li>
          </ul>
          <button
            onClick={() =>
              onCheckout({ priceId: pick("pro_plus"), interval })
            }
            className="w-full rounded bg-orange-500 hover:bg-orange-600 text-black py-3 font-bold"
          >
            Start Checkout
          </button>
        </div>
      </div>
    </div>
  );
}