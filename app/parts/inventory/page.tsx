"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";

/* ----------------------------- Types ----------------------------- */

type DB = Database;
type Part = DB["public"]["Tables"]["parts"]["Row"];
type PartInsert = DB["public"]["Tables"]["parts"]["Insert"];
type PartUpdate = DB["public"]["Tables"]["parts"]["Update"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

/* --------------------------- UI helpers -------------------------- */

function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  const { open, title, onClose, children, footer, widthClass = "max-w-xl" } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={`w-full ${widthClass} rounded border border-orange-500 bg-neutral-950 p-4 text-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, value, placeholder, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number | "";
  min?: number;
  step?: number;
  onChange: (v: number | "") => void;
}) {
  const { label, value, min = 0, step = 0.01, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <input
        type="number"
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value === "" ? "" : value}
        min={min}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { label, value, options, onChange } = props;
  return (
    <div>
      <div className="mb-1 text-xs text-neutral-400">{label}</div>
      <select
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------------------- Page ---------------------------- */

export default function InventoryPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // stock locations
  const [locs, setLocs] = useState<StockLoc[]>([]);

  // add modal
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [sku, setSku] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [price, setPrice] = useState<number | "">("");

  // initial receive (optional) for Add
  const [initLoc, setInitLoc] = useState<string>("");
  const [initQty, setInitQty] = useState<number>(0);

  // edit modal
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editSku, setEditSku] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editPrice, setEditPrice] = useState<number | "">("");

  // receive modal (standalone quick receive)
  const [recvOpen, setRecvOpen] = useState<boolean>(false);
  const [recvPart, setRecvPart] = useState<Part | null>(null);
  const [recvLoc, setRecvLoc] = useState<string>("");
  const [recvQty, setRecvQty] = useState<number>(0);

  const load = async (sid: string) => {
    setLoading(true);
    const base = supabase
      .from("parts")
      .select("*")
      .eq("shop_id", sid)
      .order("name", { ascending: true });

    const { data, error } = await (search.trim()
      ? base.or(
          [
            `name.ilike.%${search}%`,
            `sku.ilike.%${search}%`,
            `category.ilike.%${search}%`,
          ].join(","),
        )
      : base);

    if (!error) setParts((data as Part[]) ?? []);
    setLoading(false);
  };

  /* boot */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      const sid = (prof?.shop_id as string) || "";
      setShopId(sid);
      if (!sid) return;

      const { data: l } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("shop_id", sid)
        .order("code");

      const locRows = (l as StockLoc[]) ?? [];
      setLocs(locRows);

      const main = locRows.find(
        (x) => (x.code ?? "").toUpperCase() === "MAIN",
      );
      if (main) {
        setInitLoc(main.id);
        setRecvLoc(main.id);
      }

      await load(sid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* refetch on search */
  useEffect(() => {
    if (shopId) void load(shopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /* ----------------------- CRUD handlers ----------------------- */

  const createPart = async () => {
    if (!shopId || !name.trim()) return;

    const id = uuidv4();

    const insert: PartInsert = {
      id,
      shop_id: shopId,
      // name is required in most schemas; keep defined, not null
      name: name.trim(),
      // optional fields: provide undefined (NOT null) to satisfy strict types
      sku: sku.trim() ? sku.trim() : undefined,
      category: category.trim() ? category.trim() : undefined,
      price: typeof price === "number" ? price : undefined,
    };

    const { error } = await supabase.from("parts").insert(insert);
    if (error) {
      alert(error.message);
      return;
    }

    // optional initial receive
    if (initLoc && initQty > 0) {
      const { error: smErr } = await supabase.rpc("apply_stock_move", {
        p_part: id,
        p_loc: initLoc,
        p_qty: initQty,
        p_reason: "receive",
        p_ref_kind: "manual_receive",
        // IMPORTANT: pass undefined, not null, to satisfy function arg types
        p_ref_id: undefined,
      });
      if (smErr) alert(`Part created, but stock receive failed: ${smErr.message}`);
    }

    setAddOpen(false);
    setName("");
    setSku("");
    setCategory("");
    setPrice("");
    setInitQty(0);
    await load(shopId);
  };

  const openEdit = (p: Part) => {
    setEditPart(p);
    setEditName(p.name ?? "");
    setEditSku(p.sku ?? "");
    setEditCategory(p.category ?? "");
    setEditPrice(typeof p.price === "number" ? p.price : "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editPart?.id) return;

    // Only send fields that changed, using undefined for omitted values
    const patch: PartUpdate = {
      name: editName.trim() ? editName.trim() : undefined,
      sku: editSku.trim() ? editSku.trim() : undefined,
      category: editCategory.trim() ? editCategory.trim() : undefined,
      price: typeof editPrice === "number" ? editPrice : undefined,
    };

    const { error } = await supabase
      .from("parts")
      .update(patch)
      .eq("id", editPart.id);

    if (error) {
      alert(error.message);
      return;
    }

    setEditOpen(false);
    await load(shopId);
  };

  const openReceive = (p: Part) => {
    setRecvPart(p);
    setRecvQty(0);
    // leave recvLoc as-is (defaults to MAIN if we found it)
    setRecvOpen(true);
  };

  const applyReceive = async () => {
    if (!recvPart?.id || !recvLoc || recvQty <= 0) return;
    const { error } = await supabase.rpc("apply_stock_move", {
      p_part: recvPart.id,
      p_loc: recvLoc,
      p_qty: recvQty,
      p_reason: "receive",
      p_ref_kind: "manual_receive",
      p_ref_id: undefined, // IMPORTANT: undefined not null
    });
    if (error) {
      alert(error.message);
      return;
    }
    setRecvOpen(false);
    await load(shopId);
  };

  /* ----------------------------- UI ----------------------------- */

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex items-center gap-2">
          <input
            className="w-64 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
            placeholder="Search name / SKU / category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="font-header rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
            onClick={() => setAddOpen(true)}
            disabled={!shopId}
          >
            Add Part
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          Loading…
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
          No parts yet. Click “Add Part” to create your first item.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900">
              <tr className="text-left text-neutral-400">
                <th className="p-2">Name</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Category</th>
                <th className="p-2">Price</th>
                <th className="p-2 w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-t border-neutral-800">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.sku ?? "—"}</td>
                  <td className="p-2">{p.category ?? "—"}</td>
                  <td className="p-2">
                    {typeof p.price === "number" ? `$${p.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded border border-blue-600 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/20"
                        onClick={() => openReceive(p)}
                      >
                        Receive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Part */}
      <Modal
        open={addOpen}
        title="Add Part"
        onClose={() => setAddOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
              onClick={createPart}
              disabled={!name.trim()}
            >
              Save Part
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={name} onChange={setName} placeholder="Part name" />
          </div>
          <TextField label="SKU" value={sku} onChange={setSku} placeholder="Optional" />
          <TextField label="Category" value={category} onChange={setCategory} placeholder="Optional" />
          <NumberField label="Price" value={price} onChange={setPrice} />
        </div>

        <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-3">
          <div className="mb-2 text-sm font-semibold">Initial Stock (optional)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Location"
              value={initLoc}
              onChange={setInitLoc}
              options={[
                { value: "", label: "— none —" },
                ...locs.map((l) => ({
                  value: l.id,
                  label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
                })),
              ]}
            />
            <NumberField
              label="Qty"
              value={initQty}
              min={0}
              step={1}
              onChange={(v) => setInitQty(typeof v === "number" ? Math.max(0, v) : 0)}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Part */}
      <Modal
        open={editOpen}
        title="Edit Part"
        onClose={() => setEditOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10 disabled:opacity-60"
              onClick={saveEdit}
              disabled={!editName.trim()}
            >
              Save Changes
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Name*" value={editName} onChange={setEditName} />
          </div>
          <TextField label="SKU" value={editSku} onChange={setEditSku} />
          <TextField label="Category" value={editCategory} onChange={setEditCategory} />
          <NumberField label="Price" value={editPrice} onChange={setEditPrice} />
        </div>
      </Modal>

      {/* Receive Stock */}
      <Modal
        open={recvOpen}
        title={recvPart ? `Receive — ${recvPart.name}` : "Receive Stock"}
        onClose={() => setRecvOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              onClick={() => setRecvOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-300 hover:bg-blue-900/20 disabled:opacity-60"
              onClick={applyReceive}
              disabled={!recvPart?.id || !recvLoc || recvQty <= 0}
            >
              Apply Receive
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Location"
            value={recvLoc}
            onChange={setRecvLoc}
            options={locs.map((l) => ({
              value: l.id,
              label: `${l.code ?? "LOC"} — ${l.name ?? ""}`,
            }))}
          />
          <NumberField
            label="Qty"
            value={recvQty}
            min={0}
            step={1}
            onChange={(v) => setRecvQty(typeof v === "number" ? Math.max(0, v) : 0)}
          />
        </div>
      </Modal>
    </div>
  );
}