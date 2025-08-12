"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Customer = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "first_name" | "last_name" | "phone" | "email" | "street" | "city" | "province" | "postal_code"
>;

export default function PortalProfilePage() {
  const supabase = createClientComponentClient<Database>();
  const [form, setForm] = useState<Customer>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    street: "",
    city: "",
    province: "",
    postal_code: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: customer } = await supabase
        .from("customers")
        .select(
          "first_name,last_name,phone,email,street,city,province,postal_code",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (customer) {
       setForm({
        first_name: customer.first_name ?? "",
        last_name: customer.last_name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        street: customer.street ?? "",
        city: customer.city ?? "",
        province: customer.province ?? "",
        postal_code: customer.postal_code ?? "",
      }); 
      }
      setLoading(false);
    })();
  }, [supabase]);

  const onSave = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("customers")
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        phone: form.phone || null,
        email: form.email || null,
        street: form.street || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
      })
      .eq("user_id", user.id);

    setLoading(false);
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold mb-2">My Profile</h1>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="First name"
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Last name"
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className="input"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>

      {/* Address */}
      <div className="space-y-3">
        <input
          className="input"
          placeholder="Street address"
          value={form.street ?? ""}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="City"
            value={form.city ?? ""}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <input
            className="input"
            placeholder="Province/State"
            value={form.province ?? ""}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
          />
          <input
            className="input"
            placeholder="Postal/ZIP code"
            value={form.postal_code ?? ""}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </div>
      </div>

      <button className="btn" onClick={onSave} disabled={loading}>
        {loading ? "Saving…" : "Save"}
      </button>
    </div>
  );
}