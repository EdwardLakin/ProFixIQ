// /features/work-orders/mobile/MobileFocusedJob.tsx (FULL FILE REPLACEMENT)
// ✅ UI/theme only: align to MobileTechHome (metal-panel / metal-card)
// ✅ FIX: pass lineLabel + onSaveDraft into CauseCorrectionModal so “Save” shows
// ✅ Restore canonical hold/remove-hold flow for focused mobile actions

"use client";

import { useEffect, useMemo, useState, useCallback, type JSX } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import {
  getOfflineSyncSummary,
  getOfflineMutationScope,
  listOfflineMutations,
  listPendingMutations,
  runMutationWithOfflineQueue,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { replayAndReconcileOfflineMutations } from "@/features/shared/lib/offline/replay";
import { postOfflineServerMutation } from "@/features/shared/lib/offline/server-mutations";
import {
  removeOfflineBlob,
  saveOfflineBlob,
} from "@/features/shared/lib/offline/database";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import AIAssistantModal from "@work-orders/components/workorders/AiAssistantModal";

import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import {
  getCanonicalPartDescription,
  getCanonicalPartManufacturer,
  getCanonicalPartNumber,
  getCanonicalPartQuantity,
} from "@/features/work-orders/lib/display/workOrderParts";

import VehicleHistoryModal from "@/features/work-orders/components/workorders/VehicleHistoryModal";
import VoiceDictationButton from "@/features/shared/voice/VoiceDictationButton";
import {
  clearTechnicianJobEditorDraftFields,
  findProjectedTechnicianJob,
  getTechnicianJobEditorDraft,
  saveTechnicianJobEditorDraft,
} from "@/features/work-orders/mobile/technicianOfflineExecution";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Mode = "tech" | "view";

const statusTextColor: Record<string, string> = {
  in_progress: "text-sky-200",
  awaiting: "text-[color:var(--theme-text-primary)]",
  queued: "text-indigo-200",
  on_hold: "text-amber-200",
  completed: "text-emerald-200",
  paused: "text-amber-200",
  assigned: "text-sky-200",
  unassigned: "text-[color:var(--theme-text-primary)]",
  awaiting_approval: "text-blue-200",
  declined: "text-red-200",
};

const chip = (s: string | null) =>
  statusTextColor[(s ?? "awaiting").toLowerCase().replaceAll(" ", "_")] ??
  "text-[color:var(--theme-text-primary)]";

/* ---------------------------- UI (theme-only) ---------------------------- */

const panel = "mobile-tech-panel";

const card = "mobile-tech-subpanel";

const fieldLabel = "text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]";

const btnBase = "rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors";
const btnNeutral = `${btnBase} mobile-tech-btn-secondary`;
const btnWarn = `${btnBase} mobile-tech-btn-danger`;
const btnInfo = `${btnBase} mobile-tech-btn-utility`;

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

type RequiredPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"] & {
  description_snapshot?: string | null;
  manufacturer_snapshot?: string | null;
  part_number_snapshot?: string | null;
  unit_sell_price_snapshot?: number | null;
  lifecycle_status?: string | null;
  source_parts_request_item_id?: string | null;
  parts?: { name: string | null; part_number?: string | null; manufacturer?: string | null } | null;
};

type SyncSummary = ReturnType<typeof getOfflineSyncSummary>;
type StagedPhoto = {
  clientMutationId: string;
  file: File;
  previewUrl: string;
  fileName: string;
};

function canPunch(line: WorkOrderLine | null): boolean {
  if (!line) return false;

  // Respect approval gating (matches app behavior: do not allow punching while awaiting/declined/not-approved)
  if (line.status === "awaiting_approval") return false;
  if (line.status === "declined") return false;

  const approval = (line as unknown as { approval_state?: string | null })
    ?.approval_state;
  if (approval && approval !== "approved") return false;

  return true;
}

function formatElapsed(startIso: string, nowMs: number): string {
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) return "—";
  const delta = Math.max(0, nowMs - startMs);
  const totalMinutes = Math.floor(delta / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function MobileFocusedJob(props: {
  workOrderLineId: string;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
  mode?: Mode;
}): JSX.Element {
  const { workOrderLineId, onBack, onChanged, mode = "tech" } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [techNotes, setTechNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>(() => getOfflineSyncSummary());
  const [elapsedNow, setElapsedNow] = useState<number>(() => Date.now());
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);

  // sub-modals
  const [openComplete, setOpenComplete] = useState(false);
  const [openParts, setOpenParts] = useState(false);
  const [openHold, setOpenHold] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(false);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);
  const [openAi, setOpenAi] = useState(false);

  // ✅ vehicle history modal
  const [openVehicleHistory, setOpenVehicleHistory] = useState(false);

  // prefill
  const [prefillCause, setPrefillCause] = useState("");
  const [prefillCorrection, setPrefillCorrection] = useState("");

  // parts used
  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [requiredParts, setRequiredParts] = useState<RequiredPartRow[]>([]);
  const [allocsLoading, setAllocsLoading] = useState(false);

  const showErr = (prefix: string, err?: { message?: string } | null) => {
    toast.error(`${prefix}: ${err?.message ?? "Something went wrong."}`);
    // eslint-disable-next-line no-console
    console.error(prefix, err);
  };

  const refreshSyncState = useCallback(() => {
    const summary = getOfflineSyncSummary();
    setSyncSummary(summary);
    setPendingWrites(summary.queued + summary.syncing + summary.failed + summary.conflicted);
  }, []);

  const getLineConflict = useCallback(
    async (targetLineId: string, mode: "notes" | "finish" | "story"): Promise<string | null> => {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select("id,status,approval_state")
        .eq("id", targetLineId)
        .maybeSingle<{ id: string; status: string | null; approval_state: string | null }>();
      if (error) throw error;
      if (!data?.id) return "Job line no longer exists.";

      if (mode === "finish" && data.status === "completed") return "Job line is already completed.";
      if (mode === "finish" && data.status === "declined") return "Job line is declined and cannot be finished.";
      if (mode === "story" && data.status === "completed") {
        return "Job line is already completed. Story edits require advisor review.";
      }
      if (mode === "notes" && data.approval_state === "approved" && data.status === "completed") {
        return "Job line is completed and approved. Notes update blocked.";
      }
      return null;
    },
    [supabase],
  );

  useEffect(() => {
    const refreshPending = () => {
      setPendingWrites(listPendingMutations().length);
      refreshSyncState();
    };
    refreshPending();
    const unsubscribe = subscribeOfflineMutations(refreshPending);
    window.addEventListener("online", refreshPending);
    return () => {
      unsubscribe();
      window.removeEventListener("online", refreshPending);
    };
  }, [refreshSyncState]);

  useEffect(() => {
    const t = window.setInterval(() => setElapsedNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const closeAllSubModals = () => {
    setOpenComplete(false);
    setOpenParts(false);
    setOpenHold(false);
    setOpenPhoto(false);
    setOpenChat(false);
    setOpenAddJob(false);
    setOpenAi(false);
    setOpenVehicleHistory(false);
  };

  const loadVehicle = useCallback(
    async (vehicleId: string | null) => {
      if (!vehicleId) {
        setVehicle(null);
        return;
      }
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .maybeSingle<Vehicle>();
      if (error) throw error;
      setVehicle(data ?? null);
    },
    [supabase],
  );

  const loadCustomer = useCallback(
    async (customerId: string | null) => {
      if (!customerId) {
        setCustomer(null);
        return;
      }
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle<Customer>();
      if (error) throw error;
      setCustomer(data ?? null);
    },
    [supabase],
  );

  const loadWorkOrder = useCallback(
    async (workOrderId: string | null) => {
      if (!workOrderId) {
        setWorkOrder(null);
        setVehicle(null);
        setCustomer(null);
        return;
      }

      const { data: wo, error: we } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", workOrderId)
        .maybeSingle<WorkOrder>();
      if (we) throw we;

      setWorkOrder(wo ?? null);

      await loadVehicle(wo?.vehicle_id ?? null);
      await loadCustomer(wo?.customer_id ?? null);
    },
    [supabase, loadVehicle, loadCustomer],
  );

  const loadOfflineJob = useCallback(
    async (id: string): Promise<boolean> => {
      const scope = getOfflineMutationScope();
      if (!scope) return false;
      const cached = await findProjectedTechnicianJob({ scope, lineId: id });
      if (!cached) return false;

      setLine(cached.line);
      setWorkOrder(cached.snapshot.workOrder);
      setVehicle(cached.snapshot.vehicle);
      setCustomer(cached.snapshot.customer);
      const editorDraft = await getTechnicianJobEditorDraft({
        scope,
        lineId: id,
      });
      if (editorDraft?.notes != null) {
        setTechNotes(editorDraft.notes);
        setNotesDirty(true);
      } else if (!notesDirty) {
        setTechNotes(cached.line.notes ?? "");
      }
      if (editorDraft?.cause != null) setPrefillCause(editorDraft.cause);
      else setPrefillCause(cached.line.cause ?? "");
      if (editorDraft?.correction != null)
        setPrefillCorrection(editorDraft.correction);
      else setPrefillCorrection(cached.line.correction ?? "");
      return true;
    },
    [notesDirty],
  );

  const loadLine = useCallback(
    async (id: string) => {
      if (!navigator.onLine) {
        if (!(await loadOfflineJob(id))) {
          throw new Error("No downloaded copy of this job is available.");
        }
        return;
      }
      const { data: l, error: le } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("id", id)
        .maybeSingle<WorkOrderLine>();
      if (le) {
        if (await loadOfflineJob(id)) return;
        throw le;
      }

      setLine(l ?? null);

      // ✅ align with app logic: keep notes in sync unless user is actively editing
      if (!notesDirty) {
        setTechNotes(l?.notes ?? "");
      }

      await loadWorkOrder(l?.work_order_id ?? null);
    },
    [supabase, loadWorkOrder, loadOfflineJob, notesDirty],
  );

  const loadAllocations = useCallback(async () => {
    if (!workOrderLineId) return;
    if (!navigator.onLine) {
      setAllocs([]);
      setRequiredParts([]);
      return;
    }
    setAllocsLoading(true);
    try {
      let allocBuilder = supabase
        .from("work_order_part_allocations")
        .select("*, parts(name)")
        .eq("work_order_line_id", workOrderLineId);
      let requiredBuilder = supabase
        .from("work_order_parts")
        .select("*, parts(name, part_number, sku, manufacturer, supplier)")
        .eq("work_order_line_id", workOrderLineId)
        .eq("is_active", true);
      if (workOrder?.id) {
        allocBuilder = allocBuilder.eq("work_order_id", workOrder.id);
        requiredBuilder = requiredBuilder.eq("work_order_id", workOrder.id);
      }
      if (workOrder?.shop_id) {
        allocBuilder = allocBuilder.eq("shop_id", workOrder.shop_id);
        requiredBuilder = requiredBuilder.eq("shop_id", workOrder.shop_id);
      }

      const [allocQuery, requiredQuery] = await Promise.all([
        allocBuilder.order("created_at", { ascending: true }),
        requiredBuilder.order("created_at", { ascending: true }),
      ]);
      if (allocQuery.error) throw allocQuery.error;
      if (requiredQuery.error) throw requiredQuery.error;
      setAllocs((allocQuery.data as AllocationRow[]) ?? []);
      setRequiredParts((requiredQuery.data as RequiredPartRow[]) ?? []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[MobileFocusedJob] load allocations failed", e);
    } finally {
      setAllocsLoading(false);
    }
  }, [supabase, workOrder?.id, workOrder?.shop_id, workOrderLineId]);

  useEffect(() => {
    if (!notesDirty || !workOrderLineId) return;
    const scope = getOfflineMutationScope();
    if (!scope) return;
    const timer = window.setTimeout(() => {
      void getTechnicianJobEditorDraft({ scope, lineId: workOrderLineId }).then(
        (existing) =>
          saveTechnicianJobEditorDraft({
            scope,
            draft: {
              ...existing,
              lineId: workOrderLineId,
              notes: techNotes,
              updatedAt: new Date().toISOString(),
            },
          }),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [notesDirty, techNotes, workOrderLineId]);

  const refresh = useCallback(async () => {
    if (!workOrderLineId) return;
    try {
      await loadLine(workOrderLineId);
      await onChanged?.();
      await loadAllocations();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err?.message ?? "Failed to refresh job");
    }
  }, [workOrderLineId, loadLine, onChanged, loadAllocations]);

  const replayOfflineMutations = useCallback(async () => {
    const result = await replayAndReconcileOfflineMutations();
    refreshSyncState();
    setStagedPhotos((prev) =>
      prev.filter((photo) => {
        const mutation = listOfflineMutations().find((item) => item.clientMutationId === photo.clientMutationId);
        return mutation?.status !== "synced";
      }),
    );

    if (result.replayed > 0) {
      toast.success(`Synced ${result.replayed} pending update${result.replayed === 1 ? "" : "s"}.`);
      await refresh();
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} offline update${result.failed === 1 ? "" : "s"} failed and need retry.`);
    }
    if (result.conflicted > 0) {
      toast.warning(`${result.conflicted} update${result.conflicted === 1 ? "" : "s"} need manual resolution.`);
    }
  }, [refreshSyncState, refresh]);

  // initial load (page behavior)
  useEffect(() => {
    if (!workOrderLineId) return;
    (async () => {
      setBusy(true);
      try {
        await loadLine(workOrderLineId);
        await loadAllocations();
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message ?? "Failed to load job");
      } finally {
        setBusy(false);
      }
    })();
  }, [workOrderLineId, loadLine, loadAllocations]);

  // realtime: line
  useEffect(() => {
    if (!workOrderLineId) return;

    const ch = supabase
      .channel(`wol-${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `id=eq.${workOrderLineId}`,
        },
        (payload: RealtimePostgresChangesPayload<WorkOrderLine>) => {
          const next = payload.new;
          if (next && typeof (next as Partial<WorkOrderLine>).id === "string") {
            const nextLine = next as WorkOrderLine;
            setLine(nextLine);

            // ✅ keep notes synced unless user is editing
            if (!notesDirty) setTechNotes(nextLine.notes ?? "");

            // ✅ if WO pointer changes, reload related entities
            const nextWoId = nextLine.work_order_id ?? null;
            const currentWoId = line?.work_order_id ?? null;
            if (nextWoId !== currentWoId) {
              void loadWorkOrder(nextWoId);
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderLineId, supabase, notesDirty, loadWorkOrder]);

  // realtime: work order (keeps vehicle/customer/status aligned like app)
  useEffect(() => {
    const woId = line?.work_order_id ?? null;
    if (!woId) return;

    const ch = supabase
      .channel(`wo-${woId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `id=eq.${woId}`,
        },
        (payload: RealtimePostgresChangesPayload<WorkOrder>) => {
          const next = payload.new;
          if (next && typeof (next as Partial<WorkOrder>).id === "string") {
            const wo = next as WorkOrder;
            setWorkOrder(wo);

            // If vehicle/customer pointers change, reload them
            void loadVehicle(wo.vehicle_id ?? null);
            void loadCustomer(wo.customer_id ?? null);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, line?.work_order_id, loadVehicle, loadCustomer]);

  // allocations
  useEffect(() => {
    void loadAllocations();
  }, [loadAllocations]);

  useEffect(() => {
    if (!workOrderLineId) return;

    const ch = supabase
      .channel(`wol-parts-${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_part_allocations",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        () => void loadAllocations(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_parts",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        () => void loadAllocations(),
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [workOrderLineId, supabase, loadAllocations]);

  // cross-component refresh event (matches app pattern)
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("wol:refresh", handler);
    return () => window.removeEventListener("wol:refresh", handler);
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => {
      void replayOfflineMutations();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [replayOfflineMutations]);

  useEffect(
    () => () => {
      stagedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    },
    [stagedPhotos],
  );

  // parts request events
  useEffect(() => {
    const handleClose = () => setOpenParts(false);
    const handleSubmitted = async () => {
      setOpenParts(false);
      await refresh();
    };

    window.addEventListener("parts-request:close", handleClose);
    window.addEventListener("parts-request:submitted", handleSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", handleClose);
      window.removeEventListener("parts-request:submitted", handleSubmitted);
    };
  }, [refresh]);

  // inspection done → open complete (mobile page still listens like app modal)
  useEffect(() => {
    const onInspectionDone = (evt: Event) => {
      const e = evt as CustomEvent<{
        workOrderLineId?: string;
        cause?: string;
        correction?: string;
      }>;
      const detail = e.detail || {};
      if (!detail.workOrderLineId) return;
      if (detail.workOrderLineId !== workOrderLineId) return;

      closeAllSubModals();
      setPrefillCause(detail.cause ?? "");
      setPrefillCorrection(detail.correction ?? "");
      setOpenComplete(true);
    };

    window.addEventListener("inspection:completed", onInspectionDone);
    return () =>
      window.removeEventListener("inspection:completed", onInspectionDone);
  }, [workOrderLineId]);

  const applyHold = async (reason: string, notes?: string) => {
    if (busy) return;
    if (!line) return;

    setBusy(true);
    try {
      await runJobPunchTransition(workOrderLineId, "pause", {
        holdReason: reason || "On hold",
        notes: notes ?? line.notes ?? null,
      });

      toast.success("Hold applied");
      await refresh();
    } catch (error) {
      showErr("Apply hold failed", error as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  const releaseHold = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runJobPunchTransition(workOrderLineId, "resume", {
        toAwaiting: true,
      });

      toast.success("Hold removed");
      await refresh();
    } catch (error) {
      showErr("Remove hold failed", error as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!workOrderLineId || !workOrder?.id) return;

    const clientMutationId = uuidv4();
    const path = `wo/${workOrder.id}/lines/${workOrderLineId}/${clientMutationId}_${file.name}`;
    const previewUrl = URL.createObjectURL(file);
    const scope = getOfflineMutationScope();
    if (!scope) throw new Error("Offline shop scope is unavailable. Reconnect and try again.");
    await saveOfflineBlob({
      id: clientMutationId,
      userId: scope.userId,
      shopId: scope.shopId,
      createdAt: new Date().toISOString(),
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      blob: file,
    });

    let result: { queued: boolean; conflicted: boolean };
    try {
      result = await runMutationWithOfflineQueue({
        clientMutationId,
        actionType: "upload_job_photo",
        payload: {
          workOrderLineId,
          path,
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          blobId: clientMutationId,
        },
        orderKey: `${workOrderLineId}:photo:${clientMutationId}`,
        runner: async () => {
          const { error } = await supabase.storage.from("job-photos").upload(path, file, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });
          if (error) throw error;
          await postOfflineServerMutation({
            actionType: "upload_job_photo",
            operationKey: clientMutationId,
            payload: {
              workOrderLineId,
              path,
              fileName: file.name,
              mimeType: file.type || "image/jpeg",
              blobId: clientMutationId,
            },
          });
        },
      });
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      await removeOfflineBlob(clientMutationId);
      throw error;
    }

    refreshSyncState();
    if (result.queued) {
      setStagedPhotos((prev) => [
        ...prev,
        { clientMutationId, file, previewUrl, fileName: file.name },
      ]);
      toast.warning("Photo queued. Retry when connection is restored.");
      return;
    }

    URL.revokeObjectURL(previewUrl);
    await removeOfflineBlob(clientMutationId);
    toast.success("Photo attached");
    window.dispatchEvent(new CustomEvent("wol:refresh"));
  };

  const saveNotes = async () => {
    if (!workOrderLineId) return;
    if (savingNotes) return;

    // avoid spam writes if unchanged
    const serverNotes = line?.notes ?? "";
    if (!notesDirty && techNotes === serverNotes) return;

    setSavingNotes(true);
    try {
      const mutationId = `${workOrderLineId}:notes:${Date.now()}`;
      const payload = {
        workOrderLineId,
        notes: techNotes,
        baseUpdatedAt: line?.updated_at ?? null,
      };
      const result = await runMutationWithOfflineQueue({
        clientMutationId: mutationId,
        actionType: "update_work_order_line_notes",
        payload,
        orderKey: `${workOrderLineId}:001:notes`,
        conflictCheck: () => getLineConflict(workOrderLineId, "notes"),
        runner: async () => {
          await postOfflineServerMutation({
            actionType: "update_work_order_line_notes",
            operationKey: mutationId,
            payload,
          });
        },
      });

      refreshSyncState();
      if (result.conflicted) {
        toast.error("Notes changed on server. Resolve conflict before retrying.");
        return;
      }
      if (result.queued) {
        const scope = getOfflineMutationScope();
        if (scope)
          await clearTechnicianJobEditorDraftFields({
            scope,
            lineId: workOrderLineId,
            fields: ["notes"],
          });
        setNotesDirty(false);
        await loadOfflineJob(workOrderLineId);
        toast.warning("Notes queued for retry when back online.");
        return;
      }

      toast.success("Notes saved");
      const scope = getOfflineMutationScope();
      if (scope)
        await clearTechnicianJobEditorDraftFields({
          scope,
          lineId: workOrderLineId,
          fields: ["notes"],
        });
      setNotesDirty(false);
      await refresh();
    } catch (error) {
      showErr("Save notes failed", error as { message?: string });
    } finally {
      setSavingNotes(false);
    }
  };

  const startAt = line?.punched_in_at ?? null;
  const finishAt = line?.punched_out_at ?? null;

  const titleText =
    `${line?.line_no ? `#${line.line_no} ` : ""}` +
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const createdStart = startAt ? format(new Date(startAt), "PPpp") : "—";
  const createdFinish = finishAt ? format(new Date(finishAt), "PPpp") : "—";

  const lineLabel =
    (line?.complaint ?? "").trim() ||
    (line?.description ?? "").trim() ||
    (line?.line_no ? `Line #${line.line_no}` : "") ||
    "Job";

  const offlineMutations = useMemo(
    () => listOfflineMutations().filter((item) => item.status !== "synced"),
    [syncSummary],
  );

  const isOnHold = line?.status === "on_hold";
  const normalizedStatus = String(line?.status ?? "").toLowerCase();
  const isCompleted =
    normalizedStatus === "completed" ||
    normalizedStatus === "ready_to_invoice" ||
    normalizedStatus === "invoiced" ||
    (!!line?.punched_out_at && normalizedStatus !== "on_hold");
  const hasActivePunch = !!line?.punched_in_at && !line?.punched_out_at;
  const isActive =
    !isCompleted &&
    !isOnHold &&
    (normalizedStatus === "in_progress" || hasActivePunch);
  const isAwaiting = !!line && !isActive && !isOnHold && !isCompleted;
  const canStartOrResume = !!line && canPunch(line) && !isCompleted;
  const canPrimaryAction = isOnHold || (canStartOrResume && (isActive || isAwaiting));
  const needsApprovalGate =
    line?.status === "awaiting_approval" ||
    (line?.approval_state != null && line.approval_state !== "approved") ||
    line?.status === "declined";

  const primaryActionLabel = isOnHold
    ? "Remove Hold"
    : isActive
      ? "Finish Job"
      : isAwaiting
        ? "Start Job"
        : "View Details";

  const liveStateLabel = isActive
    ? "Active"
    : isOnHold
      ? "On Hold"
      : isCompleted
        ? "Completed"
        : "Awaiting";

  const livePillClass = isActive
    ? "border-cyan-300/65 bg-cyan-500/14 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.22)] [animation:pulse_2.6s_ease-in-out_infinite]"
    : isOnHold
      ? "border-amber-300/60 bg-amber-500/14 text-amber-100"
      : isCompleted
        ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]"
        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-primary)]";

  const elapsedText =
    line?.punched_in_at && (isActive || isCompleted)
      ? formatElapsed(line.punched_in_at, elapsedNow)
      : null;

  return (
    <>
      <div className="app-shell flex min-h-screen flex-col text-foreground">
        {/* Header */}
        <header className="metal-bar sticky top-0 z-40 flex items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              closeAllSubModals();
              onBack();
            }}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[11px] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
          >
            <span>←</span>
            <span className="uppercase tracking-[0.16em]">Back</span>
          </button>

          <div className="flex-1 truncate px-2 text-center text-[11px] font-medium">
            {line ? (
              <span className={chip(line.status ?? null)}>{titleText}</span>
            ) : (
              "Job"
            )}
          </div>

          {workOrder?.id ? (
            <button
              type="button"
              className="mobile-tech-btn-secondary rounded-full px-3 py-1.5 text-[11px] font-semibold"
              onClick={() => {
                closeAllSubModals();
                setOpenAddJob(true);
              }}
              disabled={busy}
            >
              + Job
            </button>
          ) : (
            <div className="w-14" />
          )}
        </header>

        <div className="px-3 pt-2">
          <div className="mobile-tech-subpanel px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[color:var(--theme-text-primary)]">Sync status</span>
              <span
                className={
                  syncSummary.conflicted > 0 || syncSummary.failed > 0
                    ? "text-red-200"
                    : syncSummary.queued > 0 || syncSummary.syncing > 0
                      ? "text-amber-200"
                      : "text-emerald-200"
                }
              >
                {syncSummary.conflicted > 0
                  ? "Needs attention"
                  : syncSummary.failed > 0
                    ? "Failed"
                    : syncSummary.syncing > 0
                      ? "Syncing"
                      : syncSummary.queued > 0
                        ? "Pending"
                        : "Synced"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
              Pending: {pendingWrites} • Failed: {syncSummary.failed} • Conflicted: {syncSummary.conflicted}
            </div>
            {(pendingWrites > 0 || syncSummary.failed > 0 || syncSummary.conflicted > 0) && (
              <button
                type="button"
                onClick={() => void replayOfflineMutations()}
                className="mobile-tech-btn-secondary mt-2 rounded-md px-2 py-1 text-[11px] text-[color:var(--theme-text-primary)]"
              >
                Retry sync now
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <main className="mobile-tech-page flex-1 overflow-y-auto px-3 py-3">
          <div className="mx-auto max-w-4xl space-y-4">
            {busy && !line ? (
              <div className="grid gap-3">
                <div className="h-6 w-40 animate-pulse rounded-full bg-[color:var(--theme-surface-subtle)]" />
                <div className="h-24 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
              </div>
            ) : !line ? (
              <div className={`${panel} px-4 py-4 text-sm text-[color:var(--theme-text-secondary)]`}>
                No job found.
              </div>
            ) : (
              <>
                {/* dominant next action */}
                {mode === "tech" && line && (
                  <div className={`${panel} px-4 py-3`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                        Current Job State
                      </div>
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          livePillClass,
                        ].join(" ")}
                      >
                        {liveStateLabel}
                      </span>
                    </div>

                    <div className="mb-3 text-xs text-[color:var(--theme-text-secondary)]">
                      {line.punched_in_at ? (
                        <div>
                          Started {format(new Date(line.punched_in_at), "PPp")}
                          {elapsedText ? <span className="text-[color:var(--theme-text-secondary)]"> • Elapsed {elapsedText}</span> : null}
                        </div>
                      ) : (
                        <div className="text-[color:var(--theme-text-secondary)]">Not started yet.</div>
                      )}
                      {(isOnHold || line.hold_reason) && line.hold_reason ? (
                        <div className="mt-1 text-amber-200">Hold reason: {line.hold_reason}</div>
                      ) : null}
                      {isCompleted && line.punched_out_at ? (
                        <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                          Finished {format(new Date(line.punched_out_at), "PPp")}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={busy || !canPrimaryAction}
                        onClick={() => {
                          if (!line || busy) return;
                          if (isOnHold) {
                            closeAllSubModals();
                            setOpenHold(true);
                            return;
                          }
                          if (isActive) {
                            closeAllSubModals();
                            setPrefillCause(line.cause ?? "");
                            setPrefillCorrection(line.correction ?? "");
                            setOpenComplete(true);
                            return;
                          }
                          if (isAwaiting) {
                            void (async () => {
                              setBusy(true);
                              try {
                                await runJobPunchTransition(workOrderLineId, "start");
                                toast.success("Job started");
                                await refresh();
                              } catch (error) {
                                showErr("Start job failed", error as { message?: string });
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }
                        }}
                        className={[
                          "mobile-tech-btn-primary flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                          "disabled:cursor-not-allowed disabled:opacity-45",
                        ].join(" ")}
                      >
                        {primaryActionLabel}
                      </button>
                      {isActive ? (
                        <button
                          type="button"
                          className={btnWarn}
                          onClick={() => {
                            closeAllSubModals();
                            setOpenHold(true);
                          }}
                          disabled={busy}
                        >
                          Put on Hold
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={btnNeutral}
                          onClick={() => {
                            closeAllSubModals();
                            setOpenParts(true);
                          }}
                          disabled={busy}
                        >
                          Request Parts
                        </button>
                      )}
                    </div>
                    {needsApprovalGate && (
                      <div className="mt-2 text-[11px] text-amber-300">
                        Approval required before job punch actions.
                      </div>
                    )}
                  </div>
                )}

                {/* supporting timing/details */}
                <details className={`${card} px-3 py-2`}>
                  <summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                    Timing & status details
                  </summary>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <div>
                      <div className={fieldLabel}>Status</div>
                      <div className={`mt-1 font-semibold ${chip(line.status ?? null)}`}>
                        {String(line.status || "awaiting").replaceAll("_", " ")}
                      </div>
                    </div>
                    <div>
                      <div className={fieldLabel}>Start</div>
                      <div className="mt-1 text-[color:var(--theme-text-primary)]">{createdStart}</div>
                    </div>
                    <div>
                      <div className={fieldLabel}>Finish</div>
                      <div className="mt-1 text-[color:var(--theme-text-primary)]">{createdFinish}</div>
                    </div>
                  </div>
                </details>

                {/* vehicle & customer */}
                <div className={`${panel} px-4 py-4 text-sm`}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className={fieldLabel}>Vehicle</div>
                      <div className="mt-1 truncate text-[color:var(--theme-text-primary)]">
                        {vehicle
                          ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`
                              .trim()
                              .replace(/\s+/g, " ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                        VIN: {vehicle?.vin ?? "—"} • Plate: {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>

                    <div>
                      <div className={fieldLabel}>Customer</div>
                      <div className="mt-1 truncate text-[color:var(--theme-text-primary)]">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                        {customer?.phone ?? "—"} {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* controls */}
                <div className={`${panel} px-4 py-4`}>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Operational actions</div>
                  <div className="grid gap-2 md:grid-cols-3">
                  {mode === "tech" ? (
                    <>
                      <button
                        type="button"
                        className={btnNeutral}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenPhoto(true);
                        }}
                        disabled={busy}
                      >
                        Add Photo
                      </button>

                      <button
                        type="button"
                        className={btnNeutral}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenChat(true);
                        }}
                      >
                        Chat
                      </button>

                      <button
                        type="button"
                        className={btnInfo}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenAi(true);
                        }}
                      >
                        AI Assist
                      </button>

                      {/* ✅ Vehicle History */}
                      <button
                        type="button"
                        className={btnNeutral}
                        onClick={() => {
                          if (!vehicle?.id) {
                            toast.error("No vehicle linked to this work order yet.");
                            return;
                          }
                          setOpenVehicleHistory(true);
                        }}
                        disabled={busy || !vehicle?.id}
                      >
                        Vehicle History
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={btnNeutral}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenChat(true);
                        }}
                      >
                        Chat
                      </button>
                      <button
                        type="button"
                        className={btnInfo}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenAi(true);
                        }}
                      >
                        AI Assist
                      </button>

                      {/* ✅ Vehicle History */}
                      <button
                        type="button"
                        className={btnNeutral}
                        onClick={() => {
                          if (!vehicle?.id) {
                            toast.error("No vehicle linked to this work order yet.");
                            return;
                          }
                          setOpenVehicleHistory(true);
                        }}
                        disabled={busy || !vehicle?.id}
                      >
                        Vehicle History
                      </button>
                    </>
                  )}
                  </div>
                </div>

                {/* parts used */}
                {(stagedPhotos.length > 0 || offlineMutations.length > 0) && (
                  <div className={`${panel} px-4 py-4`}>
                    <div className="mb-2 text-sm font-medium text-[color:var(--theme-text-primary)]">Offline sync queue</div>
                    {stagedPhotos.map((photo) => (
                      <div
                        key={photo.clientMutationId}
                        className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2"
                      >
                        <img src={photo.previewUrl} alt={photo.fileName} className="h-10 w-10 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-amber-100">{photo.fileName}</div>
                          <div className="text-[11px] text-amber-200">Staged locally • waiting for upload</div>
                        </div>
                      </div>
                    ))}
                    <ul className="space-y-2 text-xs">
                      {offlineMutations.map((mutation) => (
                        <li
                          key={mutation.clientMutationId}
                          className="mobile-tech-subpanel rounded-lg px-2 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[color:var(--theme-text-primary)]">{mutation.actionType.replaceAll("_", " ")}</span>
                            <span
                              className={
                                mutation.status === "conflicted"
                                  ? "text-red-200"
                                  : mutation.status === "failed"
                                    ? "text-amber-200"
                                    : mutation.status === "syncing"
                                      ? "text-sky-200"
                                      : "text-[color:var(--theme-text-secondary)]"
                              }
                            >
                              {mutation.status}
                            </span>
                          </div>
                          {mutation.lastError ? <div className="mt-1 text-[11px] text-amber-200">{mutation.lastError}</div> : null}
                          {mutation.conflictReason ? (
                            <div className="mt-1 text-[11px] text-red-200">{mutation.conflictReason}</div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* parts used */}
                <div className={`${panel} px-4 py-4`}>
                  <div className="mb-2 text-sm font-medium text-[color:var(--theme-text-primary)]">
                    Parts used
                  </div>

                  {allocsLoading ? (
                    <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading…</div>
                  ) : (allocs.length + requiredParts.length) === 0 ? (
                    <div className="text-sm text-[color:var(--theme-text-secondary)]">No parts used yet.</div>
                  ) : (
                    <div className="mobile-tech-subpanel overflow-hidden">
                      <div className="grid grid-cols-12 bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                        <div className="col-span-7">Part</div>
                        <div className="col-span-3">Location</div>
                        <div className="col-span-2 text-right">Qty</div>
                      </div>
                      <ul className="max-h-56 overflow-auto divide-y divide-[color:var(--theme-border-soft)]">
                        {requiredParts.map((p) => (
                          <li
                            key={`required-${p.id}`}
                            className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                          >
                            <div className="col-span-7 truncate text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartDescription(p) ?? "—"}
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                              {[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ") || "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartQuantity(p)}
                            </div>
                          </li>
                        ))}
                        {allocs.map((a) => (
                          <li
                            key={a.id}
                            className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                          >
                            <div className="col-span-7 truncate text-[color:var(--theme-text-primary)]">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                              {a.location_id
                                ? `loc ${String(a.location_id).slice(0, 6)}…`
                                : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                              {a.qty}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* tech notes */}
                <div className={`${panel} px-4 py-4`}>
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--theme-text-primary)]">
                        Tech Notes
                      </label>
                      <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                        Dictation appends to the draft and stays editable.
                      </p>
                    </div>
                    <VoiceDictationButton
                      disabled={savingNotes || mode === "view"}
                      idleLabel="Dictate note"
                      listeningLabel="Stop"
                      onTranscript={(transcript) => {
                        if (!transcript) return;
                        setTechNotes((current) => {
                          const existing = current.trim();
                          return existing ? `${existing} ${transcript}` : transcript;
                        });
                        setNotesDirty(true);
                      }}
                    />
                  </div>
                  <textarea
                    rows={4}
                    value={techNotes}
                    onChange={(e) => {
                      setTechNotes(e.target.value);
                      setNotesDirty(true);
                    }}
                    onBlur={saveNotes}
                    disabled={savingNotes}
                    className="mobile-tech-input px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                    placeholder="Add notes for this job…"
                  />
                  {notesDirty && (
                    <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                      Unsaved changes (tap away to save)
                    </div>
                  )}
                </div>

                {/* AI suggestions */}
                <div className={`${panel} px-4 py-4`}>
                  <h3 className="mb-2 text-sm font-medium text-[color:var(--theme-text-primary)]">
                    AI Suggested Repairs
                  </h3>
                  {line && workOrder ? (
                    <SuggestedQuickAdd
                      jobId={line.id}
                      workOrderId={workOrder.id}
                      vehicleId={vehicle?.id ?? null}
                      onAdded={async () => {
                        toast.success("Suggested line added");
                        await refresh();
                      }}
                    />
                  ) : (
                    <div className="text-sm text-[color:var(--theme-text-secondary)]">
                      Vehicle/work order details required.
                    </div>
                  )}
                </div>

                <div className="pb-16 text-[11px] text-[color:var(--theme-text-secondary)]">
                  Job ID: {line.id}
                  {typeof line.labor_time === "number"
                    ? ` • Labor: ${line.labor_time.toFixed(1)}h`
                    : ""}
                  {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
                  {line.approval_state ? ` • Approval: ${line.approval_state}` : ""}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* ✅ Vehicle history modal */}
      {openVehicleHistory && vehicle?.id && workOrder?.id && line?.id ? (
        <VehicleHistoryModal
          isOpen={openVehicleHistory}
          onClose={() => setOpenVehicleHistory(false)}
          workOrderId={workOrder.id}
          workOrderLineId={line.id}
        />
      ) : null}

      {/* sub-modals */}
      {openComplete && line && (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
          lineLabel={lineLabel}
          initialCause={prefillCause}
          initialCorrection={prefillCorrection}
          onDraftChange={(cause, correction) => {
            const scope = getOfflineMutationScope();
            if (!scope) return;
            void getTechnicianJobEditorDraft({
              scope,
              lineId: line.id,
            }).then((existing) =>
              saveTechnicianJobEditorDraft({
                scope,
                draft: {
                  ...existing,
                  lineId: line.id,
                  cause,
                  correction,
                  updatedAt: new Date().toISOString(),
                },
              }),
            );
          }}
          onSubmit={async (cause: string, correction: string) => {
            try {
              const conflict = navigator.onLine
                ? await getLineConflict(line.id, "finish")
                : null;
              if (conflict) {
                toast.error(conflict);
                return;
              }
              await runJobPunchTransition(line.id, "finish", {
                cause,
                correction,
              });
              const scope = getOfflineMutationScope();
              if (scope)
                await clearTechnicianJobEditorDraftFields({
                  scope,
                  lineId: line.id,
                  fields: ["cause", "correction"],
                });
            } catch (error) {
              return showErr("Complete job failed", error as { message?: string });
            }

            toast.success("Job completed");
            setOpenComplete(false);
            await refresh();

            // Let other listeners update (app parity)
            window.dispatchEvent(
              new CustomEvent("work-order-line:completed", {
                detail: { workOrderLineId: line.id },
              }),
            );
          }}
          onSaveDraft={async (cause: string, correction: string) => {
            const mutationId = `${line.id}:story:${Date.now()}`;
            const payload = {
              lineId: line.id,
              cause,
              correction,
              baseUpdatedAt: line.updated_at,
            };
            const result = await runMutationWithOfflineQueue({
              clientMutationId: mutationId,
              actionType: "save_story_draft",
              payload,
              orderKey: `${line.id}:002:story`,
              conflictCheck: () => getLineConflict(line.id, "story"),
              runner: async () => {
                await postOfflineServerMutation({
                  actionType: "save_story_draft",
                  operationKey: mutationId,
                  payload,
                });
              },
            });

            refreshSyncState();
            if (result.conflicted) {
              toast.error("Story conflict detected. Review latest line status.");
              return;
            }
            if (result.queued) {
              const scope = getOfflineMutationScope();
              if (scope)
                await clearTechnicianJobEditorDraftFields({
                  scope,
                  lineId: line.id,
                  fields: ["cause", "correction"],
                });
              await loadOfflineJob(line.id);
              toast.warning("Story queued for sync when back online.");
              return;
            }

            const scope = getOfflineMutationScope();
            if (scope)
              await clearTechnicianJobEditorDraftFields({
                scope,
                lineId: line.id,
                fields: ["cause", "correction"],
              });
            toast.success("Story saved");
            await refresh();
          }}
        />
      )}

      {openParts && workOrder?.id && line && (
        <PartsRequestModal
          isOpen={openParts}
          workOrderId={workOrder.id}
          jobId={line.id}
          requestNote={line.description ?? ""}
        />
      )}

      {openHold && line && (
        <HoldModal
          isOpen={openHold}
          onClose={() => setOpenHold(false)}
          onApply={applyHold}
          onRelease={isOnHold ? releaseHold : undefined}
          canRelease={isOnHold}
          defaultReason={line.hold_reason || "Awaiting parts"}
        />
      )}

      {openPhoto && (
        <PhotoCaptureModal
          isOpen={openPhoto}
          onClose={() => setOpenPhoto(false)}
          onCapture={uploadPhoto}
        />
      )}

      {openChat && (
        <NewChatModal
          isOpen={openChat}
          onClose={() => setOpenChat(false)}
          created_by="system"
          onCreated={() => setOpenChat(false)}
          context_type="work_order_line"
          context_id={line?.id ?? null}
        />
      )}

      {openAi && (
        <AIAssistantModal
          isOpen={openAi}
          onClose={() => setOpenAi(false)}
          workOrderLineId={line?.id ?? undefined}
          defaultVehicle={
            vehicle
              ? {
                  year: vehicle.year ? String(vehicle.year) : undefined,
                  make: vehicle.make ?? undefined,
                  model: vehicle.model ?? undefined,
                }
              : undefined
          }
        />
      )}

      {openAddJob && workOrder?.id && (
        <AddJobModal
          isOpen={openAddJob}
          onClose={() => setOpenAddJob(false)}
          workOrderId={workOrder.id}
          vehicleId={vehicle?.id ?? null}
          techId={
            (line as unknown as { assigned_tech_id?: string | null })
              ?.assigned_tech_id ?? "system"
          }
          shopId={workOrder?.shop_id ?? null}
          onJobAdded={async () => {
            await refresh();
            setOpenAddJob(false);
          }}
        />
      )}
    </>
  );
}
