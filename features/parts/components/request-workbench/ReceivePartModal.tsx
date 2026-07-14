"use client";

import { WorkbenchModalFrame, modalButton } from "./WorkbenchModalFrame";

export function ReceivePartModal({
  open,
  title = "Receive Part",
  hasPartId,
  onOpenReceiveDrawer,
  onClose,
}: {
  open: boolean;
  title?: string;
  hasPartId?: boolean;
  onOpenReceiveDrawer?: () => void;
  onClose?: () => void;
}): JSX.Element | null {
  return (
    <WorkbenchModalFrame
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={modalButton} onClick={onClose}>Close</button>
          {hasPartId ? (
            <button type="button" className={modalButton} onClick={onOpenReceiveDrawer}>Open Receive Drawer</button>
          ) : null}
        </div>
      }
    >
      {hasPartId ? (
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Receiving uses the existing ReceiveDrawer behavior so partial intake, PO context, stock movement, and quote-line sync stay preserved.
        </p>
      ) : (
        <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 p-3 text-sm text-amber-100">
          Inventory must be attached before receiving into stock. This does not block Save, Use Inventory, or Order.
        </div>
      )}
    </WorkbenchModalFrame>
  );
}
