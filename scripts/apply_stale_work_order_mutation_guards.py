from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Pattern not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


# Shared helper lint/readability hardening.
replace_once(
    "features/work-orders/lib/client/validateMutableWorkOrder.ts",
    '''    text.includes("work_order_lines_work_order_id_fkey") ||
    text.includes("foreign key") && text.includes("work_order") ||
    text.includes("work order no longer exists") ||''',
    '''    text.includes("work_order_lines_work_order_id_fkey") ||
    (text.includes("foreign key") && text.includes("work_order")) ||
    text.includes("work order no longer exists") ||''',
)

# Create-page recovery and mutation-time checks.
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    'import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";\n',
    '''import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import {
  CREATE_WORK_ORDER_STALE_EVENT,
  requireMutableWorkOrder,
  STALE_CREATE_WORK_ORDER_MESSAGE,
} from "@/features/work-orders/lib/client/validateMutableWorkOrder";
''',
)
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    '''  const isPersistedWorkOrderPending = Boolean(
    wo?.id && !hasValidatedWorkOrder,
  );

  // ✅ inspection modal state''',
    '''  const isPersistedWorkOrderPending = Boolean(
    wo?.id && !hasValidatedWorkOrder,
  );

  useEffect(() => {
    const handleStaleDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ workOrderId?: string }>).detail;
      if (!detail?.workOrderId || detail.workOrderId !== wo?.id) return;
      setWo(null);
      setLines([]);
      setValidatedWorkOrderId(null);
      setError(STALE_CREATE_WORK_ORDER_MESSAGE);
      toast.error(STALE_CREATE_WORK_ORDER_MESSAGE);
    };
    window.addEventListener(CREATE_WORK_ORDER_STALE_EVENT, handleStaleDraft);
    return () =>
      window.removeEventListener(
        CREATE_WORK_ORDER_STALE_EVENT,
        handleStaleDraft,
      );
  }, [setError, setLines, setWo, wo?.id]);

  // ✅ inspection modal state''',
)
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    '''    async (lineId: string) => {
      if (!wo?.id) return;

      const ok = confirm("Delete this line?");''',
    '''    async (lineId: string) => {
      if (!wo?.id) return;

      try {
        await requireMutableWorkOrder({
          supabase,
          workOrderId: wo.id,
          shopId: wo.shop_id,
        });
      } catch (staleError) {
        alert(
          staleError instanceof Error
            ? staleError.message
            : STALE_CREATE_WORK_ORDER_MESSAGE,
        );
        return;
      }

      const ok = confirm("Delete this line?");''',
)
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    '''    async (ln: WorkOrderLine) => {
      if (!ln?.id) return;

      const anyLine = ln as WorkOrderLineWithInspectionMeta;''',
    '''    async (ln: WorkOrderLine) => {
      if (!ln?.id || !wo?.id) return;

      try {
        await requireMutableWorkOrder({
          supabase,
          workOrderId: wo.id,
          shopId: wo.shop_id,
        });
      } catch (staleError) {
        toast.error(
          staleError instanceof Error
            ? staleError.message
            : STALE_CREATE_WORK_ORDER_MESSAGE,
        );
        return;
      }

      const { data: liveLine, error: liveLineError } = await supabase
        .from("work_order_lines")
        .select("id")
        .eq("id", ln.id)
        .eq("work_order_id", wo.id)
        .maybeSingle();
      if (liveLineError) {
        toast.error(liveLineError.message);
        return;
      }
      if (!liveLine) {
        toast.error("This work-order line no longer exists. The list was refreshed.");
        await fetchLines();
        return;
      }

      const anyLine = ln as WorkOrderLineWithInspectionMeta;''',
)
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    '''    [wo?.id],
  );
''',
    '''    [fetchLines, supabase, wo?.id, wo?.shop_id],
  );
''',
)

# Manual line entry validates the parent immediately before every write.
replace_once(
    "features/work-orders/components/NewWorkOrderLineForm.tsx",
    'import type { Database } from "@shared/types/types/supabase";\n',
    '''import type { Database } from "@shared/types/types/supabase";
import {
  isMissingWorkOrderWriteError,
  requireMutableWorkOrder,
  signalStaleCreateWorkOrder,
  STALE_CREATE_WORK_ORDER_MESSAGE,
} from "@/features/work-orders/lib/client/validateMutableWorkOrder";
''',
)
replace_once(
    "features/work-orders/components/NewWorkOrderLineForm.tsx",
    '''    try {
      // Prefer exact vehicle-specific repair if available (job lines only)''',
    '''    try {
      await requireMutableWorkOrder({ supabase, workOrderId, shopId });

      // Prefer exact vehicle-specific repair if available (job lines only)''',
)
replace_once(
    "features/work-orders/components/NewWorkOrderLineForm.tsx",
    '''        if (!repairRes.ok || !repairJson?.ok) {
          setErr(repairJson?.error || "Failed to add matched repair to Quote Review.");
          return;
        }''',
    '''        if (!repairRes.ok || !repairJson?.ok) {
          const repairError =
            repairJson?.error || "Failed to add matched repair to Quote Review.";
          if (isMissingWorkOrderWriteError({ message: repairError })) {
            signalStaleCreateWorkOrder(workOrderId);
            setErr(STALE_CREATE_WORK_ORDER_MESSAGE);
          } else {
            setErr(repairError);
          }
          return;
        }''',
)
replace_once(
    "features/work-orders/components/NewWorkOrderLineForm.tsx",
    '''      if (error) {
        const msg = error.message || "Insert failed";

        if (/(job_type).*check/i.test(msg)) {''',
    '''      if (error) {
        const msg = error.message || "Insert failed";

        if (isMissingWorkOrderWriteError(error)) {
          signalStaleCreateWorkOrder(workOrderId);
          setErr(STALE_CREATE_WORK_ORDER_MESSAGE);
        } else if (/(job_type).*check/i.test(msg)) {''',
)
replace_once(
    "features/work-orders/components/NewWorkOrderLineForm.tsx",
    '''    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Failed to add line.";
      setErr(msg);''',
    '''    } catch (e: unknown) {
      if (isMissingWorkOrderWriteError(e)) {
        signalStaleCreateWorkOrder(workOrderId);
        setErr(STALE_CREATE_WORK_ORDER_MESSAGE);
      } else {
        const msg = (e as Error)?.message ?? "Failed to add line.";
        setErr(msg);
      }''',
)

# Menu/template quick adds use the same mutation-time parent guard and recovery.
replace_once(
    "features/work-orders/components/MenuQuickAdd.tsx",
    'import { calculateTax, type ProvinceCode } from "@/features/integrations/tax";\n',
    '''import { calculateTax, type ProvinceCode } from "@/features/integrations/tax";
import {
  isMissingWorkOrderWriteError,
  requireMutableWorkOrder,
  signalStaleCreateWorkOrder,
  STALE_CREATE_WORK_ORDER_MESSAGE,
} from "@/features/work-orders/lib/client/validateMutableWorkOrder";
''',
)
replace_once(
    "features/work-orders/components/MenuQuickAdd.tsx",
    '''    try {
      await ensureShopContext(shopId);
''',
    '''    try {
      await requireMutableWorkOrder({ supabase, workOrderId, shopId });
      await ensureShopContext(shopId);
''',
)
replace_once(
    "features/work-orders/components/MenuQuickAdd.tsx",
    '''    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add job.";
      lastSetShopId.current = null;
      toast.error(msg);
      return null;''',
    '''    } catch (e: unknown) {
      lastSetShopId.current = null;
      if (isMissingWorkOrderWriteError(e)) {
        signalStaleCreateWorkOrder(workOrderId);
        toast.error(STALE_CREATE_WORK_ORDER_MESSAGE);
      } else {
        const msg = e instanceof Error ? e.message : "Failed to add job.";
        toast.error(msg);
      }
      return null;''',
)

# Focused regression coverage.
replace_once(
    "tests/codex-review-followup-hardening.test.ts",
    '''    expect(createPage).toContain("disabled={!hasValidatedWorkOrder}");
    expect(read("app/api/parts/_lib/lifecycleCommand.ts")).toContain(''',
    '''    expect(createPage).toContain("disabled={!hasValidatedWorkOrder}");
    expect(createPage).toContain("CREATE_WORK_ORDER_STALE_EVENT");
    expect(createPage).toContain("requireMutableWorkOrder");
    expect(read("features/work-orders/components/NewWorkOrderLineForm.tsx")).toContain(
      "requireMutableWorkOrder",
    );
    expect(read("features/work-orders/components/MenuQuickAdd.tsx")).toContain(
      "requireMutableWorkOrder",
    );
    expect(read("app/api/parts/_lib/lifecycleCommand.ts")).toContain(''',
)

# Remove one-off patch machinery from the resulting branch.
(ROOT / ".github/workflows/apply-stale-work-order-guards.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
