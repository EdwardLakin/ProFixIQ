"use client";

import type { WorkbenchOption } from "./types";
import { WorkbenchModalFrame, modalButton, modalInput, modalPrimaryButton } from "./WorkbenchModalFrame";

export type CreateInventoryItemInput = {
  name: string;
  partNumber: string;
  manufacturer: string;
  sku: string;
  category: string;
  cost: string;
  sellPrice: string;
  defaultSupplierId: string;
  initialQty: string;
};

export function CreateInventoryItemModal({
  open,
  title = "Add to Stock",
  value,
  supplierOptions = [],
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title?: string;
  value: CreateInventoryItemInput;
  supplierOptions?: WorkbenchOption[];
  onChange?: (value: CreateInventoryItemInput) => void;
  onSubmit?: () => void;
  onClose?: () => void;
}): JSX.Element | null {
  function patch(next: Partial<CreateInventoryItemInput>): void {
    onChange?.({ ...value, ...next });
  }

  return (
    <WorkbenchModalFrame
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={modalButton} onClick={onClose}>Cancel</button>
          <button type="button" className={modalPrimaryButton} onClick={onSubmit}>Create and attach</button>
        </div>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-neutral-400">Name</span>
          <input className={modalInput} value={value.name} onChange={(event) => patch({ name: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Part #</span>
          <input className={modalInput} value={value.partNumber} onChange={(event) => patch({ partNumber: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Manufacturer</span>
          <input className={modalInput} value={value.manufacturer} onChange={(event) => patch({ manufacturer: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">SKU</span>
          <input className={modalInput} value={value.sku} onChange={(event) => patch({ sku: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Category</span>
          <input className={modalInput} value={value.category} onChange={(event) => patch({ category: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Cost</span>
          <input className={modalInput} type="number" min="0" step="0.01" value={value.cost} onChange={(event) => patch({ cost: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Sell price</span>
          <input className={modalInput} type="number" min="0" step="0.01" value={value.sellPrice} onChange={(event) => patch({ sellPrice: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Default supplier optional</span>
          <select className={modalInput} value={value.defaultSupplierId} onChange={(event) => patch({ defaultSupplierId: event.target.value })}>
            <option value="">No default supplier</option>
            {supplierOptions.map((supplier) => <option key={supplier.value} value={supplier.value}>{supplier.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-neutral-400">Initial qty optional</span>
          <input className={modalInput} type="number" min="0" step="1" value={value.initialQty} onChange={(event) => patch({ initialQty: event.target.value })} />
        </label>
      </div>
    </WorkbenchModalFrame>
  );
}
