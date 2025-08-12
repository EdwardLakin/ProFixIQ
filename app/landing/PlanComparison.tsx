"use client";

import { useEffect, useState } from "react";
import { PRICE_IDS } from "@stripe/lib/stripe/constants";

type Plan = {
  id: string;
  nickname: string;
  unit_amount: number;
  interval: string;
};

export default function PlanComparison() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  useEffect(() => {
    const loadPlans = async () => {
      const res = await fetch("/api/plans");
      const planData = await res.json();
      setPlans(planData);
    };
    loadPlans();
  }, []);

  const filteredPlans = plans.filter((plan) =>
    billingCycle === "monthly"
      ? [
          PRICE_IDS.free.monthly,
          PRICE_IDS.pro.monthly,
          PRICE_IDS.pro_plus.monthly,
        ].includes(plan.id)
      : [PRICE_IDS.pro.yearly, PRICE_IDS.pro_plus.yearly].includes(plan.id),
  );

  const formatPrice = (amount: number) => `$${(amount / 100).toFixed(0)}`;

  const handleCheckout = async (priceId: string) => {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });

    const { url } = await res.json();
    if (url) {
      window.location.href = url;
    } else {
      alert("Checkout failed");
    }
  };

  return (
    <div className="bg-black text-white py-16 px-4 font-blackops">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-4xl mb-2 text-orange-500">Compare Plans</h2>
        <p className="mb-6 text-neutral-400">
          Pick the plan that works best for your shop
        </p>

        <div className="mb-8">
          <button
            className={`px-6 py-2 rounded-l ${
              billingCycle === "monthly"
                ? "bg-orange-500 text-black"
                : "bg-gray-800"
            }`}
            onClick={() => setBillingCycle("monthly")}
          >
            Monthly
          </button>
          <button
            className={`px-6 py-2 rounded-r ${
              billingCycle === "yearly"
                ? "bg-orange-500 text-black"
                : "bg-gray-800"
            }`}
            onClick={() => setBillingCycle("yearly")}
          >
            Yearly
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className="border border-orange-500 rounded-xl p-6 bg-neutral-900 hover:shadow-glow transition-all"
            >
              <h3 className="text-2xl mb-2 text-orange-400">{plan.nickname}</h3>
              <p className="text-3xl mb-4 font-bold">
                {formatPrice(plan.unit_amount)}
              </p>
              <p className="text-sm mb-6 text-neutral-400">
                {billingCycle === "yearly" ? "per year" : "per month"}
              </p>
              <ul className="text-left space-y-2 text-neutral-300 mb-6">
                <li>✅ Work Order Management</li>
                <li>✅ AI Diagnostics</li>
                <li>✅ Parts & Inventory</li>
                {plan.nickname.includes("Pro+") && (
                  <li>✅ Team Collaboration Tools</li>
                )}
              </ul>
              <button
                onClick={() => handleCheckout(plan.id)}
                className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-black rounded"
              >
                Choose Plan
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
