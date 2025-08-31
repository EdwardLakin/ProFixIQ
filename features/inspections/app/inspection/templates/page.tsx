"use client";

import { useEffect, useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

import type { Database } from "@shared/types/types/supabase";

type InspectionTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Row"];

export default function InspectionTemplatesPage() {
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [filtered, setFiltered] = useState<InspectionTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  useEffect(() => {
    const loadTemplates = async () => {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading templates:", error.message);
      } else {
        setTemplates(data ?? []);
        setFiltered(data ?? []);
      }
      setLoading(false);
    };

    loadTemplates();
  }, [supabase]);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(templates);
    } else {
      setFiltered(
        templates.filter(
          (t) =>
            (t.template_name || "").toLowerCase().includes(q) ||
            (t.description || "").toLowerCase().includes(q)
        )
      );
    }
  }, [search, templates]);

  const handleLoad = (id: string) => {
    router.push(`/dashboard/inspections/custom-inspection?id=${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/dashboard/inspections/custom-inspection?id=${id}&edit=true`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase
      .from("inspection_templates")
      .delete()
      .eq("id", id);

    if (error) console.error(error.message);
    else {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setFiltered((prev) => prev.filter((t) => t.id !== id));
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-white mb-4">
        Shared Inspection Templates
      </h1>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by title or description"
        className="mb-4 text-black"
      />

      {loading ? (
        <p className="text-white">Loading templates...</p>
      ) : filtered.length === 0 ? (
        <p className="text-white">No templates found.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="border border-gray-700 p-4 rounded-md bg-zinc-800"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold text-orange-400">
                  {t.template_name}
                </h2>
                <div className="flex gap-2">
                  <Button onClick={() => handleLoad(t.id)}>Load</Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleEdit(t.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {t.description && (
                <p className="text-sm text-gray-300 mb-1">{t.description}</p>
              )}
              <p className="text-xs text-gray-500">
                Created:{" "}
                {t.created_at
                  ? new Date(t.created_at).toLocaleString()
                  : "N/A"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}