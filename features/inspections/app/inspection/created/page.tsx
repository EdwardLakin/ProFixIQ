// features/inspections/created/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type TemplatesRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type Scope = "mine" | "public";

export default function CreatedTemplatesPage() {
  const supabase = createClientComponentClient<DB>();

  const [scope, setScope] = useState<Scope>("mine");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [rows, setRows] = useState<TemplatesRow[]>([]);
  const [search, setSearch] = useState<string>("");

  // auth + first load
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  // refetch on scope or user change
  useEffect(() => {
    (async () => {
      setLoading(true);
      const query = supabase.from("inspection_templates").select("*");

      if (scope === "mine") {
        if (!userId) {
          setRows([]);
          setLoading(false);
          return;
        }
        query.eq("user_id", userId);
      } else {
        query.eq("is_public", true);
      }

      const { data, error } = await query.order("updated_at", {
        ascending: false,
      });
      if (error) {
        console.error("Load error:", error.message);
        setRows([]);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    })();
  }, [scope, userId, supabase]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.template_name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (Array.isArray(r.tags)
          ? r.tags.join(", ").toLowerCase().includes(q)
          : false) ||
        (r.vehicle_type || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function deleteTemplate(id: string) {
    if (scope !== "mine") return; // only allow delete from 'mine'
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase
      .from("inspection_templates")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("Delete error:", error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Inspection Templates</h1>

        <div className="flex gap-2">
          <Button
            variant={scope === "mine" ? "default" : "secondary"}
            onClick={() => setScope("mine")}
          >
            My Templates
          </Button>
          <Button
            variant={scope === "public" ? "default" : "secondary"}
            onClick={() => setScope("public")}
          >
            Public
          </Button>

          {scope === "mine" && (
            <Link
              href="/inspections/custom-inspection"
              className="rounded-md bg-orange-500 px-4 py-2 font-semibold text-black transition hover:bg-orange-600"
            >
              + Create New
            </Link>
          )}
        </div>
      </div>

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by template name, tags, description, vehicle type…"
          className="text-black"
        />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-white/80">No templates found.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-neutral-700 bg-neutral-900 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-orange-400">
                    {t.template_name}
                  </h2>
                  {t.description ? (
                    <p className="text-sm text-neutral-300">{t.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-neutral-500">
                    Vehicle: {t.vehicle_type || "N/A"}
                    {Array.isArray(t.tags) && t.tags.length > 0 ? (
                      <> | Tags: {t.tags.join(", ")}</>
                    ) : null}
                    {" | "}
                    Updated:{" "}
                    {t.updated_at
                      ? new Date(t.updated_at).toLocaleString()
                      : t.created_at
                      ? new Date(t.created_at).toLocaleString()
                      : "N/A"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/inspections/custom-inspection?id=${t.id}`}
                    className="rounded border border-neutral-600 px-3 py-2 text-sm hover:bg-neutral-700"
                  >
                    Load
                  </Link>

                  {scope === "mine" && (
                    <>
                      <Link
                        href={`/inspections/custom-inspection?id=${t.id}&edit=true`}
                        className="rounded border border-neutral-600 px-3 py-2 text-sm hover:bg-neutral-700"
                      >
                        Edit
                      </Link>
                      <Button
                        variant="destructive"
                        onClick={() => deleteTemplate(t.id)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
