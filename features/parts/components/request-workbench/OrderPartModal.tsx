"use client";

import type { WorkbenchOption } from "./types";
import { WorkbenchModalFrame, modalButton, modalInput, modalPrimaryButton } from "./WorkbenchModalFrame";

export type OrderPartInput = {
  supplierId: string;
  poMode: "existing" | "new";
  existingPoId: string;
  qty: string;
  unitCost: string;
  expectedDate: string;
};

export function OrderPartModal({
  open,
  title = "Order Part",
  value,
  supplierOptions = [],
  poOptions = [],
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title?: string;
  value: OrderPartInput;
  supplierOptions?: WorkbenchOption[];
  poOptions?: WorkbenchOption[];
  onChange?: (value: OrderPartInput) => void;
  onSubmit?: () => void;
  onClose?: () => void;
}): JSX.Element | null {
  function patch(next: Partial<OrderPartInput>): void {
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
          <button type="button" className={modalPrimaryButton} onClick={onSubmit}>Create/reuse PO</button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-[color:var(--theme-text-secondary)]">
        <p>This can create/reuse a PO directly from the request row. Inventory stock is not required.</p>
        <label className="block space-y-1">
          <span className="text-[color:var(--theme-text-secondary)]">Supplier</span>
          <select className={modalInput} value={value.supplierId} onChange={(event) => patch({ supplierId: event.target.value })}>
            <option value="">Select supplier</option>
            {supplierOptions.map((supplier) => <option key={supplier.value} value={supplier.value}>{supplier.label}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[color:var(--theme-text-secondary)]">PO option</span>
            <select className={modalInput} value={value.poMode} onChange={(event) => patch({ poMode: event.target.value as OrderPartInput["poMode"] })}>
              <option value="existing">Use existing open PO</option>
              <option value="new">Create new PO</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[color:var(--theme-text-secondary)]">Existing PO</span>
            <select className={modalInput} value={value.existingPoId} onChange={(event) => patch({ existingPoId: event.target.value })} disabled={value.poMode === "new"}>
              <option value="">Select open PO</option>
              {poOptions.map((po) => <option key={po.value} value={po.value}>{po.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[color:var(--theme-text-secondary)]">Qty</span>
            <input className={modalInput} type="number" min="1" step="1" value={value.qty} onChange={(event) => patch({ qty: event.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-[color:var(--theme-text-secondary)]">Unit cost</span>
            <input className={modalInput} type="number" min="0" step="0.01" value={value.unitCost} onChange={(event) => patch({ unitCost: event.target.value })} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[color:var(--theme-text-secondary)]">Expected date optional</span>
            <input className={modalInput} type="date" value={value.expectedDate} onChange={(event) => patch({ expectedDate: event.target.value })} />
          </label>
        </div>
      </div>
    </WorkbenchModalFrame>
  );
}
