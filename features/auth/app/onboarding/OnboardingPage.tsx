"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic";

const staffRedirect: Record<Role, string> = {
  owner: "/dashboard/owner",
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  advisor: "/dashboard/advisor",
  mechanic: "/dashboard/tech",
};

const isStaffRole = (r: string | null | undefined): r is Role =>
  r === "owner" || r === "admin" || r === "manager" || r === "advisor" || r === "mechanic";

export default function OnboardingPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [userStreet, setUserStreet] = useState("");
  const [userCity, setUserCity] = useState("");
  const [userProvince, setUserProvince] = useState("");
  const [userPostal, setUserPostal] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopStreet, setShopStreet] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [shopProvince, setShopProvince] = useState("");
  const [shopPostal, setShopPostal] = useState("");
  const [ownerPin, setOwnerPin] = useState("");

  const [asOwner, setAsOwner] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- 1) Handle Supabase magic link exchange ---
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    (async () => {
      try {
        await supabase.auth.exchangeCodeForSession(code);
      } finally {
        const keepSid = searchParams.get("session_id");
        const clean = keepSid
          ? `/onboarding?session_id=${encodeURIComponent(keepSid)}`
          : "/onboarding";
        router.replace(clean);
        setTimeout(() => router.refresh(), 0);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2) Check if user already belongs to a shop ---
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const has = !!user;
      setHasSession(has);
      setSessionChecked(true);
      if (!has || !user) return;

      const sid = searchParams.get("session_id");
      if (sid) {
        try {
          await fetch("/api/stripe/link-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid, userId: user.id }),
          });
        } catch {
          /* ignore */
        }
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role, full_name, phone, shop_id")
        .eq("id", user.id)
        .maybeSingle();

      const r = prof?.role ?? null;

      // ✅ NEW: Skip onboarding if user already linked to a shop
      if (prof?.shop_id) {
        if (isStaffRole(r)) {
          router.replace(staffRedirect[r]);
        } else {
          router.replace("/dashboard");
        }
        return;
      }

      // Legacy: otherwise check if their profile looks “complete”
      const complete =
        isStaffRole(r) &&
        !!prof?.full_name &&
        !!prof?.phone &&
        (r === "owner" ? true : !!prof?.shop_id);

      if (complete) {
        router.replace(staffRedirect[r]);
      }
    })();
  }, [router, searchParams, supabase]);

  useEffect(() => {
    setAsOwner(role === "owner");
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("User not found.");
      setLoading(false);
      return;
    }

    // Update profile
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        role: asOwner ? undefined : role,
        street: userStreet,
        city: userCity,
        province: userProvince,
        postal_code: userPostal,
        email: user.email ?? null,
      } as Database["public"]["Tables"]["profiles"]["Update"])
      .eq("id", user.id);

    if (updateErr) {
      setError("Failed to update profile.");
      setLoading(false);
      return;
    }

    // Owner bootstrap if needed
    if (asOwner) {
      if (!ownerPin || ownerPin.length < 4) {
        setError("Please provide an Owner PIN (min 4 characters).");
        setLoading(false);
        return;
      }
      if (!businessName || !shopStreet || !shopCity || !shopProvince || !shopPostal) {
        setError("Please fill all required shop fields.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/onboarding/bootstrap-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          shopName: shopName || businessName,
          address: shopStreet,
          city: shopCity,
          province: shopProvince,
          postal_code: shopPostal,
          pin: ownerPin,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.msg || "Failed to create shop. Please try again.");
        setLoading(false);
        return;
      }
    }

    const finalRole: Role = asOwner ? "owner" : role;
    router.replace(staffRedirect[finalRole] || "/dashboard");
    setLoading(false);
  };

  // --- Render ---
  if (!sessionChecked) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white">
        <div className="text-neutral-300 text-sm">Loading…</div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2 text-orange-400">Almost there</h1>
          <p className="text-neutral-400 mb-4">
            Please confirm your email from the link we sent. After confirming, you’ll be routed here automatically.
          </p>
          <a
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded border border-orange-500 px-4 py-2 text-sm text-orange-200 hover:bg-orange-500/10"
          >
            Already confirmed? Sign in
          </a>
        </div>
      </div>
    );
  }

  // --- UI ---
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-neutral-900 bg-neutral-950/60 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-blackops text-orange-400">Onboarding</h1>
            <p className="text-xs text-neutral-400">
              Tell us about you {asOwner ? "and your shop" : ""} so we can set up your workspace.
            </p>
          </div>
          <div className="text-[10px] px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
            Step 1 of 1
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-6 flex-col lg:flex-row">
        <div className="flex-1 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-sm font-semibold text-neutral-100 mb-4">Your info</h2>

              <div className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                />
                <input
                  type="text"
                  required
                  placeholder="Street Address"
                  value={userStreet}
                  onChange={(e) => setUserStreet(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    type="text"
                    required
                    placeholder="City"
                    value={userCity}
                    onChange={(e) => setUserCity(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Province"
                    value={userProvince}
                    onChange={(e) => setUserProvince(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Postal Code"
                    value={userPostal}
                    onChange={(e) => setUserPostal(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-neutral-300">Role</label>
                  <select
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="advisor">Advisor</option>
                    <option value="mechanic">Mechanic</option>
                  </select>
                  <label className="mt-1 flex items-center gap-2 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={asOwner}
                      onChange={(e) => setAsOwner(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                    />
                    I’m setting this up for my shop (make me the owner)
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-sm font-semibold text-neutral-100 mb-4">Shop info</h2>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Business Name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  required={asOwner}
                />
                <input
                  type="text"
                  placeholder="Shop Name (Optional)"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                />
                <input
                  type="text"
                  placeholder="Street Address"
                  value={shopStreet}
                  onChange={(e) => setShopStreet(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  required={asOwner}
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={shopCity}
                    onChange={(e) => setShopCity(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    required={asOwner}
                  />
                  <input
                    type="text"
                    placeholder="Province"
                    value={shopProvince}
                    onChange={(e) => setShopProvince(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    required={asOwner}
                  />
                  <input
                    type="text"
                    placeholder="Postal Code"
                    value={shopPostal}
                    onChange={(e) => setShopPostal(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                    required={asOwner}
                  />
                </div>

                {asOwner && (
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1">
                      Owner PIN (min 4 characters)
                    </label>
                    <input
                      type="password"
                      placeholder="Owner PIN"
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value)}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
              >
                {loading ? "Saving..." : "Complete Onboarding"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          </form>
        </div>

        <div className="w-full lg:w-72 space-y-6">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="text-sm font-semibold text-neutral-100 mb-2">
              What happens next
            </h3>
            <p className="text-xs text-neutral-400">
              We’ll create or update your profile, and if you’re the owner, we’ll bootstrap your shop record.
              After that you’ll land on your dashboard.
            </p>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="text-sm font-semibold text-neutral-100 mb-2">
              Current mode
            </h3>
            <p className="text-xs text-neutral-400">
              {asOwner
                ? "Owner setup — you’re creating the shop."
                : "Staff setup — you’re joining an existing shop (owner will link you)."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}