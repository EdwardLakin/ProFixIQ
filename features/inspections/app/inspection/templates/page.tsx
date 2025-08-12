// app/inspection/templates/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useRouter } from "next/navigation";

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
        setTemplates(data);
        setFiltered(data);
      }
      setLoading(false);
    };

    loadTemplates();
  }, []);

  useEffect(() => {
    const lower = search.toLowerCase();
    setFiltered(
      templates.filter(
        (t) =>
          (t.template_name || "").toLowerCase().includes(lower) ||
          (t.tags?.join(", ") || "").toLowerCase().includes(lower) ||
          (t.vehicle_type || "").toLowerCase().includes(lower),
      ),
    );
  }, [search, templates]);

  const handleLoad = (id: string) => {
    router.push(`/inspection/custom-inspection?id=${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/inspection/custom-inspection?id=${id}&edit=true`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    const { error } = await supabase
      .from("inspection_templates")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("Delete error:", error.message);
    } else {
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
        placeholder="Search by title, tag, or vehicle type"
        className="mb-4 text-black"
      />

      {loading ? (
        <p className="text-white">Loading templates...</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((template) => (
            <div
              key={template.id}
              className="border border-gray-700 p-4 rounded-md bg-zinc-800"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold text-orange-400">
                  {template.template_name}
                </h2>
                <div className="flex gap-2">
                  <Button onClick={() => handleLoad(template.id)}>Load</Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleEdit(template.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(template.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {template.description && (
                <p className="text-sm text-gray-300 mb-1">
                  {template.description}
                </p>
              )}
              <p className="text-xs text-gray-400">
                Vehicle: {template.vehicle_type || "N/A"} | Tags:{" "}
                {template.tags || "None"} | Owner: {template.user_id}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Created:{" "}
                {template.created_at
                  ? new Date(template.created_at).toLocaleString()
                  : "N/A"}
              </p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-white">No templates found.</p>
          )}
        </div>
      )}
    </div>
  );
}
