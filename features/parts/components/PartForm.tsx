"use client";
import { useState, useTransition } from "react";
import { createPart } from "@/features/parts/actions";

export function PartForm({ shopId }: { shopId: string }) {
  const [form, setForm] = useState({
    sku: "",
    name: "",
    description: "",
    unit: "ea",
    category: "",
    subcategory: "",
    default_cost: 0,
    default_price: 0,
    low_stock_threshold: 0,
    taxable: true,
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            const id = await createPart({
              shop_id: shopId,
              sku: form.sku || undefined,
              name: form.name,
              description: form.description || undefined,
              default_cost: Number(form.default_cost) || 0,
              default_price: Number(form.default_price) || 0,
              category: form.category || undefined,
              subcategory: form.subcategory || undefined,
              low_stock_threshold: Number(form.low_stock_threshold) || 0,
            });
            window.location.href = `/parts/${id}`;
          } catch (err: any) {
            setError(err?.message ?? "Failed to create part");
          }
        });
      }}
    >
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm font-medium mb-1">Name</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">SKU</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.sku}
            onChange={(e) => set("sku", e.target.value)}
            placeholder="optional"
          />
        </label>

        <label className="block md:col-span-2">
          <div className="text-sm font-medium mb-1">Description</div>
          <textarea
            className="border rounded w-full px-3 py-2"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="optional"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Category</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="e.g., filters"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Subcategory</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.subcategory}
            onChange={(e) => set("subcategory", e.target.value)}
            placeholder="e.g., oil filter"
          />
        </label>

        <label className="block">
          <div className="text-sm font-medium mb-1">Unit</div>
          <input
            className="border rounded w-full px-3 py-2"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="ea, box, set"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <div className="text-sm font-medium mb-1">Default Cost</div>
            <input
              type="number"
              step="0.01"
              className="border rounded w-full px-3 py-2"
              value={form.default_cost}
              onChange={(e) => set("default_cost", Number(e.target.value))}
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium mb-1">Default Price</div>
            <input
              type="number"
              step="0.01"
              className="border rounded w-full px-3 py-2"
              value={form.default_price}
              onChange={(e) => set("default_price", Number(e.target.value))}
            />
          </label>
        </div>

        <label className="block">
          <div className="text-sm font-medium mb-1">Low Stock Threshold</div>
          <input
            type="number"
            className="border rounded w-full px-3 py-2"
            value={form.low_stock_threshold}
            onChange={(e) => set("low_stock_threshold", Number(e.target.value))}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending || !form.name}
        className="px-4 py-2 rounded-xl bg-neutral-900 text-white"
      >
        {pending ? "Saving…" : "Create Part"}
      </button>
    </form>
  );
}
