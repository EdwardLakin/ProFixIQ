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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
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
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-300">
          Checking your session…
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen grid place-items-center bg-black text-white px-6">
        <div className="max-w-md space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 px-6 py-5">
          <h1 className="text-2xl font-blackops text-orange-400">
            Confirm your email
          </h1>
          <p className="text-sm text-neutral-300">
            We sent a confirmation link to your email. Once you confirm, we&apos;ll bring you
            back here automatically to finish setting up your account.
          </p>
          <a
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-md border border-orange-500 px-4 py-2 text-sm font-medium text-orange-100 hover:bg-orange-500/10"
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
      {/* Top bar */}
      <header className="border-b border-neutral-900 bg-neutral-950/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              ProFixIQ
            </p>
            <h1 className="text-xl font-blackops text-orange-400">
              Get your workspace ready
            </h1>
            <p className="text-xs text-neutral-400">
              Tell us about you {asOwner ? "and your shop" : ""} so we can route you to the
              right dashboard.
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-[10px]">
            <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300">
              Onboarding • Step 1 of 1
            </span>
            <span className="text-[10px] text-neutral-500">
              Takes about 1–2 minutes.
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/* Left: form */}
        <div className="flex-1 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Your info */}
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Your information
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    We use this for your profile and invoices.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                  Required
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Full name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="Mobile or shop phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Home / billing address</label>
                  <input
                    type="text"
                    required
                    placeholder="Street address"
                    value={userStreet}
                    onChange={(e) => setUserStreet(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                  />
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={userCity}
                      onChange={(e) => setUserCity(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Province / State"
                      value={userProvince}
                      onChange={(e) => setUserProvince(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Postal / ZIP"
                      value={userPostal}
                      onChange={(e) => setUserPostal(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-neutral-300">Your role</label>
                  <select
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="advisor">Advisor</option>
                    <option value="mechanic">Mechanic</option>
                  </select>
                  <label className="mt-1 flex items-center gap-2 text-[11px] text-neutral-300">
                    <input
                      type="checkbox"
                      checked={asOwner}
                      onChange={(e) => setAsOwner(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                    />
                    <span>
                      I&apos;m setting this up for my shop{" "}
                      <span className="text-neutral-400">(make me the owner)</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {/* Shop info */}
            <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">
                    Shop information
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    If you&apos;re staff, your owner can link you to a shop later.
                  </p>
                </div>
                {asOwner ? (
                  <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-300">
                    Required for owners
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                    Optional for staff
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Business name</label>
                  <input
                    type="text"
                    placeholder="Legal business name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    required={asOwner}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Shop name</label>
                  <input
                    type="text"
                    placeholder="Public-facing shop name (optional)"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-neutral-300">Shop address</label>
                  <input
                    type="text"
                    placeholder="Street address"
                    value={shopStreet}
                    onChange={(e) => setShopStreet(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                    required={asOwner}
                  />
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                      type="text"
                      placeholder="City"
                      value={shopCity}
                      onChange={(e) => setShopCity(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      required={asOwner}
                    />
                    <input
                      type="text"
                      placeholder="Province / State"
                      value={shopProvince}
                      onChange={(e) => setShopProvince(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      required={asOwner}
                    />
                    <input
                      type="text"
                      placeholder="Postal / ZIP"
                      value={shopPostal}
                      onChange={(e) => setShopPostal(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      required={asOwner}
                    />
                  </div>
                </div>

                {asOwner && (
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-300">
                      Owner PIN <span className="text-neutral-400">(min 4 characters)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="PIN you can share with trusted staff"
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value)}
                      className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      required
                    />
                    <p className="text-[11px] text-neutral-500">
                      Used to securely connect staff accounts to your shop.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Saving…" : "Complete onboarding"}
              </button>
              {error && (
                <p className="text-xs text-red-400">
                  {error}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Right side: helper cards */}
        <aside className="w-full space-y-4 lg:w-72">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              What happens next
            </h3>
            <p className="text-xs text-neutral-400">
              When you hit <span className="text-orange-300">Complete onboarding</span>,
              we&apos;ll update your profile and, if you&apos;re the owner, create your shop
              record. Then we&apos;ll route you straight to the right dashboard view.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-100">
              Current mode
            </h3>
            <p className="text-xs text-neutral-400">
              {asOwner
                ? "Owner setup — you’re creating the shop and will have full access."
                : "Staff setup — your shop owner can link you to their shop later with your profile."}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}