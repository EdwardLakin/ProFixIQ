"use client";

import { useState } from "react";
import UsersList from "@/features/admin/components/UsersList";

type Payload = {
  email: string;
  password: string;
  full_name?: string | null;
  role?: string | null;       // user_role enum string
  shop_id?: string | null;
  phone?: string | null;
};

export default function CreateUserPage(): JSX.Element {
  const [form, setForm] = useState<Payload>({
    email: "",
    password: "",
    full_name: "",
    role: "mechanic",
    shop_id: null,
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to create user.");
      }
      // Clear sensitive fields; UsersList will refresh via realtime
      setForm((f) => ({ ...f, email: "", password: "", full_name: "", phone: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 text-white">
      <h1 className="mb-4 font-header text-2xl">Create User</h1>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="input text-white"
            placeholder="Full Name"
            value={form.full_name ?? ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <input
            className="input text-white"
            placeholder="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className="input text-white"
            placeholder="User Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="input text-white"
            placeholder="Temporary Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="input text-white"
            value={form.role ?? ""}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {/* adjust to your user_role enum values */}
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="service_writer">Service Writer</option>
            <option value="mechanic">Mechanic</option>
            <option value="advisor">Advisor</option>
            <option value="guest">Guest</option>
          </select>
          <input
            className="input text-white"
            placeholder="Shop ID (optional)"
            value={form.shop_id ?? ""}
            onChange={(e) => setForm({ ...form, shop_id: e.target.value || null })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="btn btn-orange disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create User"}
          </button>
          {error && (
            <div className="text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Live list below the form */}
      <UsersList />
    </div>
  );
}