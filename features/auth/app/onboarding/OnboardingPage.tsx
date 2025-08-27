// app/onboarding/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic";

export default function OnboardingPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Session gate
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // Personal
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [userStreet, setUserStreet] = useState("");
  const [userCity, setUserCity] = useState("");
  const [userProvince, setUserProvince] = useState("");
  const [userPostal, setUserPostal] = useState("");

  // Shop
  const [businessName, setBusinessName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopStreet, setShopStreet] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [shopProvince, setShopProvince] = useState("");
  const [shopPostal, setShopPostal] = useState("");
  const [ownerPin, setOwnerPin] = useState(""); // REQUIRED by API

  // Flags
  const [asOwner, setAsOwner] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Ensure session (but do not redirect if missing; show message)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setHasSession(!!user);
      setSessionChecked(true);

      // Optional Stripe linking if you later add /api/stripe/link-user
      const sessionId = searchParams.get("session_id");
      if (user && sessionId) {
        try {
          await fetch("/api/stripe/link-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, userId: user.id }),
          });
        } catch {
          /* ignore */
        }
      }
    })();
  }, [searchParams, supabase]);

  // Sync toggle with role
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

    // 1) Update base profile info
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        role: asOwner ? undefined : role, // leave null for owner; the API will set owner
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

    // 2) Owner bootstrap (creates shop + sets role=owner)
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

    // 3) Redirect
    const finalRole: Role = asOwner ? "owner" : role;
    const redirectMap: Record<Role, string> = {
      owner: "/dashboard/owner",
      admin: "/dashboard/admin",
      manager: "/dashboard/manager",
      advisor: "/dashboard/advisor",
      mechanic: "/dashboard/tech",
    };

    setLoading(false);
    router.replace(redirectMap[finalRole] || "/dashboard");
  };

  // Session gate rendering
  if (!sessionChecked) {
    return <div className="min-h-screen grid place-items-center text-white">Loading…</div>;
  }
  if (!hasSession) {
    return (
      <div className="min-h-screen grid place-items-center text-white text-center px-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Almost there</h1>
          <p className="text-neutral-400 mb-4">
            Please confirm your email from the link we sent. After confirming, you’ll be routed here automatically.
          </p>
          <a href="/sign-in" className="text-orange-400 underline">Already confirmed? Sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Onboarding</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4">
        <h2 className="text-xl text-orange-400 mt-2">Your Info</h2>
        <input
          type="text"
          required
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="text"
          required
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="text"
          required
          placeholder="Street Address"
          value={userStreet}
          onChange={(e) => setUserStreet(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            required
            placeholder="City"
            value={userCity}
            onChange={(e) => setUserCity(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          />
          <input
            type="text"
            required
            placeholder="Province"
            value={userProvince}
            onChange={(e) => setUserProvince(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          />
          <input
            type="text"
            required
            placeholder="Postal Code"
            value={userPostal}
            onChange={(e) => setUserPostal(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          />
        </div>

        <div className="grid gap-2 mt-4">
          <label className="text-sm text-neutral-300">Role</label>
          <select
            required
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="advisor">Advisor</option>
            <option value="mechanic">Mechanic</option>
          </select>

          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asOwner}
              onChange={(e) => setAsOwner(e.target.checked)}
            />
            I’m setting this up for my shop (make me the owner)
          </label>
        </div>

        <h2 className="text-xl text-orange-400 mt-6">
          Shop Info {asOwner ? "" : "(optional)"}
        </h2>
        <input
          type="text"
          placeholder="Business Name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          required={asOwner}
        />
        <input
          type="text"
          placeholder="Shop Name (Optional)"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="text"
          placeholder="Street Address"
          value={shopStreet}
          onChange={(e) => setShopStreet(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          required={asOwner}
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="City"
            value={shopCity}
            onChange={(e) => setShopCity(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required={asOwner}
          />
          <input
            type="text"
            placeholder="Province"
            value={shopProvince}
            onChange={(e) => setShopProvince(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required={asOwner}
          />
          <input
            type="text"
            placeholder="Postal Code"
            value={shopPostal}
            onChange={(e) => setShopPostal(e.target.value)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
            required={asOwner}
          />
        </div>

        {asOwner && (
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Owner PIN (min 4 characters)
            </label>
            <input
              type="password"
              placeholder="Owner PIN"
              value={ownerPin}
              onChange={(e) => setOwnerPin(e.target.value)}
              className="w-full p-2 rounded bg-gray-900 border border-orange-500"
              required
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {loading ? "Saving..." : "Complete Onboarding"}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </div>
  );
}