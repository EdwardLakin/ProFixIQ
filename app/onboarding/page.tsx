"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function OnboardingPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"owner" | "admin" | "manager" | "advisor" | "mechanic">("owner");

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

  // ✅ New: owner bootstrap toggle (default true if role is owner)
  const [asOwner, setAsOwner] = useState(true);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const linkStripeCustomer = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const sessionId = new URLSearchParams(window.location.search).get("session_id");

      if (user) {
        setUserEmail(user.email ?? null);
        if (sessionId) {
          await fetch("/api/stripe/link-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, userId: user.id }),
          });
        }
      } else {
        router.push("/auth");
      }
    };

    linkStripeCustomer();
  }, [supabase, router]);

  // Keep toggle in sync with role selection (owner => default checked)
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

    const email = user.email;
    setUserEmail(email ?? null);

    // Always save the user's personal info on the profile
    const { error: updateProfileErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        // Do NOT set role to owner here; bootstrap route will do it when applicable.
        role: asOwner ? undefined : role, // if not owner flow, we can store selected staff role now
        street: userStreet,
        city: userCity,
        province: userProvince,
        postal_code: userPostal,
        email: email ?? null,
      } as Database["public"]["Tables"]["profiles"]["Update"])
      .eq("id", user.id);

    if (updateProfileErr) {
      console.error("Profile update error:", updateProfileErr.message);
      setError("Failed to update profile.");
      setLoading(false);
      return;
    }

    // If user toggled owner setup, call the secure server route to create the shop + set role=owner
    if (asOwner) {
      // Validate required shop fields
      if (!businessName || !shopStreet || !shopCity || !shopProvince || !shopPostal) {
        setError("Please complete all required shop fields.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/onboarding/bootstrap-owner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // pass shop details to server; the route should accept these to populate the new shop
            businessName,
            shopName: shopName || businessName,
            address: shopStreet,
            city: shopCity,
            province: shopProvince,
            postal_code: shopPostal,
            // optional: timezone, slug hint, accepts_online_booking, etc.
          }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          console.warn("bootstrap-owner failed:", j?.msg || res.statusText);
          setError(j?.msg || "Failed to create shop. Please try again.");
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Bootstrap owner error:", err);
        setError("Failed to create shop. Please try again.");
        setLoading(false);
        return;
      }
    }

    // Optional: role cookie for server-side layout logic
    await fetch("/api/set-role-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: asOwner ? "owner" : role }),
    }).catch(() => {});

    // Send welcome email (non-blocking)
    if (email) {
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          subject: "Welcome to ProFixIQ!",
          html: `<p>Hi ${fullName},</p>
                 <p>${asOwner ? `Your shop <strong>${shopName || businessName}</strong> is now set up.` : `Your profile is set up.`}</p>`,
        }),
      })
        .then(() => setEmailSent(true))
        .catch((err) => console.error("Email send failed:", err));

      // Optionally trigger email confirmation workflow
      fetch("/api/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch((err) => console.error("Email confirm failed:", err));
    }

    setSuccess(true);
    setLoading(false);

    // Final redirect: owners go to owner dashboard; staff to their dashboard; others fallback
    const redirectMap: Record<string, string> = {
      owner: "/dashboard/owner",
      admin: "/dashboard/admin",
      manager: "/dashboard/manager",
      advisor: "/dashboard/advisor",
      mechanic: "/dashboard/tech",
    };
    const finalRole = asOwner ? "owner" : role;
    router.push(redirectMap[finalRole] || "/");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Onboarding</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4">
        <h2 className="text-xl text-orange-400 mt-4">Your Info</h2>
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

        <div className="grid grid-cols-1 gap-2 mt-4">
          <label className="text-sm text-neutral-300">Role</label>
          <select
            required
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="advisor">Advisor</option>
            <option value="mechanic">Mechanic</option>
          </select>

          {/* Owner toggle */}
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={asOwner}
              onChange={(e) => setAsOwner(e.target.checked)}
            />
            I’m setting this up for my shop (make me the owner)
          </label>
        </div>

        {/* Shop fields only required when asOwner */}
        <h2 className="text-xl text-orange-400 mt-6">Shop Info {asOwner ? "" : "(optional)"}</h2>
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

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {loading ? "Saving..." : "Complete Onboarding"}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && (
          <p className="text-green-400 text-md mt-4">
            🎉 Onboarding complete! Redirecting...
          </p>
        )}

        {emailSent && !success && userEmail && (
          <button
            type="button"
            onClick={async () => {
              setResending(true);
              try {
                await fetch("/api/send-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: userEmail,
                    subject: "Welcome to ProFixIQ!",
                    html: `<p>Hi ${fullName},</p><p>Your shop <strong>${shopName || businessName}</strong> is now set up.</p>`,
                  }),
                });
              } catch (err) {
                console.error("Resend failed:", err);
              }
              setResending(false);
            }}
            className="text-sm text-orange-400 underline mt-2"
            disabled={resending}
          >
            {resending ? "Resending..." : "Resend Welcome Email"}
          </button>
        )}
      </form>
    </div>
  );
}
