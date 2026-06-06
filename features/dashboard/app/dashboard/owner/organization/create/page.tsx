"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { toast } from "sonner";

import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";


export default function CreateOrganizationPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();

    if (!trimmed) {
      toast.error("Organization name is required.");
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        toast.error("You must be signed in.");
        return;
      }

      const res = await fetch("/api/organizations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmed,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        toast.error(json.error || "Failed to create organization.");
        return;
      }

      toast.success("Organization created.");
      router.push("/dashboard/owner/settings");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5 text-foreground lg:p-6">
      <section className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div>
          <h1 className="text-xl font-semibold text-neutral-50">
            Create organization
          </h1>
          <p className="text-sm text-neutral-400">
            Link this shop to a new organization so you can manage multiple
            locations under one account.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Organization name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Example: ProFixIQ Group"
            disabled={saving}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Creating..." : "Create organization"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/owner/settings")}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
