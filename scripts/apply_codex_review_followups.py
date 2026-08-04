from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Pattern not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"Expected at least {minimum} matches in {path}, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Regex matched {count} times in {path}: {pattern}")
    write(path, next_text)


# ---------------------------------------------------------------------------
# Portal booking: validate the requested slot and prevent terminal resurrection.
# ---------------------------------------------------------------------------
write(
    "features/portal/server/validatePortalBookingSlot.ts",
    r'''import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function localParts(value: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    String(parts.weekday ?? ""),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function weekdayCandidates(raw: unknown): number[] {
  const value = Number(raw);
  if (!Number.isFinite(value)) return [];
  if (value >= 0 && value <= 6) return [value];
  if (value >= 1 && value <= 7) {
    return Array.from(new Set([value % 7, value - 1])).filter(
      (candidate) => candidate >= 0 && candidate <= 6,
    );
  }
  return [];
}

function minuteOfDay(value: string | null | undefined): number | null {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export async function validateRequestedPortalSlot(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  startsAt: string;
  endsAt: string;
}): Promise<ValidationResult> {
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 180
  ) {
    return { ok: false, error: "Select a valid appointment duration.", status: 400 };
  }

  const { data: shop, error: shopError } = await input.supabase
    .from("shops")
    .select("id,timezone,accepts_online_booking,min_notice_minutes,max_lead_days")
    .eq("id", input.shopId)
    .maybeSingle();
  if (shopError) {
    return { ok: false, error: "Unable to validate appointment availability.", status: 500 };
  }
  if (!shop?.accepts_online_booking) {
    return { ok: false, error: "Online appointment booking is not enabled for this shop.", status: 409 };
  }

  const now = Date.now();
  const minNotice = Math.max(0, Number(shop.min_notice_minutes ?? 120));
  const maxLeadDays = Math.max(1, Number(shop.max_lead_days ?? 30));
  if (start.getTime() < now + minNotice * 60_000) {
    return { ok: false, error: "This appointment does not meet the shop's minimum notice.", status: 409 };
  }
  if (start.getTime() > now + maxLeadDays * 86_400_000) {
    return { ok: false, error: "This appointment is beyond the shop's booking window.", status: 409 };
  }

  const timeZone = shop.timezone || "UTC";
  const localStart = localParts(start, timeZone);
  const localEnd = localParts(end, timeZone);
  if (
    localStart.year !== localEnd.year ||
    localStart.month !== localEnd.month ||
    localStart.day !== localEnd.day
  ) {
    return { ok: false, error: "Appointments must remain within one shop business day.", status: 409 };
  }
  if (localStart.minute % 15 !== 0) {
    return { ok: false, error: "Select one of the appointment times offered by the shop.", status: 409 };
  }

  const { data: hours, error: hoursError } = await input.supabase
    .from("shop_hours")
    .select("weekday,open_time,close_time")
    .eq("shop_id", input.shopId);
  if (hoursError) {
    return { ok: false, error: "Unable to validate shop hours.", status: 500 };
  }

  const startMinute = localStart.hour * 60 + localStart.minute;
  const endMinute = localEnd.hour * 60 + localEnd.minute;
  const insideBusinessHours = (hours ?? []).some((row) => {
    if (!weekdayCandidates(row.weekday).includes(localStart.weekday)) return false;
    const open = minuteOfDay(row.open_time);
    const close = minuteOfDay(row.close_time);
    return open != null && close != null && close > open && startMinute >= open && endMinute <= close;
  });
  if (!insideBusinessHours) {
    return { ok: false, error: "That time is outside the shop's booking hours.", status: 409 };
  }

  const [timeOffResult, bookingResult] = await Promise.all([
    input.supabase
      .from("shop_time_off")
      .select("id")
      .eq("shop_id", input.shopId)
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .limit(1),
    input.supabase
      .from("bookings")
      .select("id")
      .eq("shop_id", input.shopId)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", input.endsAt)
      .gt("ends_at", input.startsAt)
      .limit(1),
  ]);
  if (timeOffResult.error || bookingResult.error) {
    return { ok: false, error: "Unable to confirm appointment availability.", status: 500 };
  }
  if ((timeOffResult.data?.length ?? 0) > 0 || (bookingResult.data?.length ?? 0) > 0) {
    return { ok: false, error: "That appointment time is no longer available.", status: 409 };
  }

  return { ok: true };
}
''',
)

replace_once(
    "app/api/portal/request/start/route.ts",
    'import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";\n',
    'import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";\nimport { validateRequestedPortalSlot } from "@/features/portal/server/validatePortalBookingSlot";\n',
)
replace_once(
    "app/api/portal/request/start/route.ts",
    '''    const duration =
      typeof body.durationMins === "number" && Number.isFinite(body.durationMins)
        ? Math.max(15, Math.min(180, Math.trunc(body.durationMins)))
        : 60;
''',
    '''    const suppliedDuration = body.durationMins;
    if (
      suppliedDuration != null &&
      (typeof suppliedDuration !== "number" ||
        !Number.isFinite(suppliedDuration) ||
        !Number.isInteger(suppliedDuration) ||
        suppliedDuration < 15 ||
        suppliedDuration > 180)
    ) {
      return bad("durationMins must be a whole number between 15 and 180.");
    }
    const duration = suppliedDuration ?? 60;
''',
)
replace_once(
    "app/api/portal/request/start/route.ts",
    '''    const quoteLineId =
      typeof body.quoteLineId === "string" && body.quoteLineId.trim()
''',
    '''    const slotValidation = await validateRequestedPortalSlot({
      supabase: admin,
      shopId: customer.shop_id,
      startsAt,
      endsAt,
    });
    if (!slotValidation.ok) {
      return bad(slotValidation.error, slotValidation.status);
    }

    const quoteLineId =
      typeof body.quoteLineId === "string" && body.quoteLineId.trim()
''',
)

# ---------------------------------------------------------------------------
# Create-work-order stale-tab gates and mutation-time API validation.
# ---------------------------------------------------------------------------
replace_once(
    "features/work-orders/app/work-orders/create/page.tsx",
    "              workOrderId={wo?.id ?? null}\n              vehicleId={vehicleIdProp}\n              enabled={!!customerId && !!vehicleIdProp}",
    "              workOrderId={hasValidatedWorkOrder ? wo?.id ?? null : null}\n              vehicleId={vehicleIdProp}\n              enabled={hasValidatedWorkOrder && !!customerId && !!vehicleIdProp}",
)
replace_all(
    "features/work-orders/app/work-orders/create/page.tsx",
    'onClick={() => void openInspectionForLine(ln)}\n',
    'onClick={() => void openInspectionForLine(ln)}\n                                  disabled={!hasValidatedWorkOrder}\n',
)
replace_all(
    "features/work-orders/app/work-orders/create/page.tsx",
    'onClick={() => void handleDeleteLine(ln.id)}\n',
    'onClick={() => void handleDeleteLine(ln.id)}\n                                disabled={!hasValidatedWorkOrder}\n',
)

write(
    "app/api/work-orders/maintenance-suggestions/add-bundle/route.ts",
    r'''import { NextRequest, NextResponse } from "next/server";
import { addMaintenanceSuggestionToWorkOrder } from "@/features/maintenance/server/addMaintenanceSuggestionToWorkOrder";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RequestBody = {
  workOrderId?: string;
  serviceCodes?: string[];
};

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const workOrderId = body?.workOrderId?.trim();
  const serviceCodes = Array.isArray(body?.serviceCodes)
    ? body.serviceCodes.map((code) => code.trim()).filter(Boolean)
    : [];

  if (!workOrderId || serviceCodes.length === 0) {
    return NextResponse.json(
      { error: "workOrderId and serviceCodes are required" },
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (workOrderError) {
    return NextResponse.json({ error: workOrderError.message }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json(
      { error: "This saved work order no longer exists. Return to a clean create flow." },
      { status: 409 },
    );
  }

  const added: Array<{
    serviceCode: string;
    addedLineId: string;
    addPath: "menu_item" | "generic";
  }> = [];
  const skipped: Array<{ serviceCode: string; error: string }> = [];

  for (const serviceCode of serviceCodes) {
    try {
      const result = await addMaintenanceSuggestionToWorkOrder({
        supabase: access.supabase,
        workOrderId,
        serviceCode,
        userId: access.profile.id,
      });
      added.push({
        serviceCode: result.serviceCode,
        addedLineId: result.addedLineId,
        addPath: result.addPath,
      });
    } catch (error) {
      skipped.push({
        serviceCode,
        error: error instanceof Error ? error.message : "Failed to add bundle item",
      });
    }
  }

  return NextResponse.json({ ok: true, added, skipped });
}
''',
)

# ---------------------------------------------------------------------------
# Offline shift state: carry the optimistic state through the update event.
# ---------------------------------------------------------------------------
replace_once(
    "features/mobile/components/MobileShiftTracker.tsx",
    '        window.dispatchEvent(new Event("profixiq:mobile-shift-updated"));',
    '''        window.dispatchEvent(
          new CustomEvent("profixiq:mobile-shift-updated", {
            detail: { state: result.state, queued: result.queued },
          }),
        );''',
)
replace_once(
    "features/mobile/dashboard/MobileTechHome.tsx",
    '''  useEffect(() => {
    const onShiftUpdated = () => void refreshShiftState();
    window.addEventListener("profixiq:mobile-shift-updated", onShiftUpdated);
    return () =>
      window.removeEventListener(
        "profixiq:mobile-shift-updated",
        onShiftUpdated,
      );
  }, [refreshShiftState]);
''',
    '''  useEffect(() => {
    const onShiftUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        state?: { mode?: ShiftStatus | "shift"; startTime?: string | null };
        queued?: boolean;
      }>).detail;
      if (detail?.state) {
        setShiftStart(detail.state.startTime ?? null);
        const mode = detail.state.mode ?? "none";
        setShiftStatus(mode === "shift" ? "active" : mode);
      }
      if (detail?.queued || !navigator.onLine) return;
      void refreshShiftState();
    };
    window.addEventListener("profixiq:mobile-shift-updated", onShiftUpdated);
    return () =>
      window.removeEventListener(
        "profixiq:mobile-shift-updated",
        onShiftUpdated,
      );
  }, [refreshShiftState]);
''',
)
replace_once(
    "features/mobile/dashboard/MobileTechHome.tsx",
    '''    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[MobileTechHome] shift state refresh failed", error);
      setShiftStatus("none");
      setShiftStart(null);
    } finally {
''',
    '''    } catch (error) {
      // Keep the latest optimistic/offline state. A failed network refresh must
      // not turn a queued active shift into an off-shift dashboard.
      // eslint-disable-next-line no-console
      console.error("[MobileTechHome] shift state refresh failed", error);
    } finally {
''',
)

# ---------------------------------------------------------------------------
# Password activation: separate the successful credential change from retryable
# profile activation and never expose database details to the user.
# ---------------------------------------------------------------------------
write(
    "features/auth/lib/passwordActivation.ts",
    r'''import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export const PASSWORD_ACTIVATION_RETRY_MESSAGE =
  "Your password was updated, but account activation could not be completed. Retry activation or contact your shop administrator.";

export async function activatePasswordProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ ok: true } | { ok: false; userMessage: string; detail: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", userId);

  if (error) {
    return {
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: error.message,
    };
  }
  return { ok: true };
}
''',
)

write(
    "app/auth/set-password/page.tsx",
    r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";
import { activatePasswordProfile } from "@/features/auth/lib/passwordActivation";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

type StatusTone = "neutral" | "error" | "success";

function getReturnPath(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (!normalized) return "/dashboard";
  if (normalized === "customer") return "/portal";
  if (normalized === "fleet_manager") return "/fleet";
  return "/dashboard";
}

export default function SetPasswordPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const isPortalActivation = searchParams.get("mode") === "portal";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [passwordCommitted, setPasswordCommitted] = useState(false);
  const [activationUserId, setActivationUserId] = useState<string | null>(null);
  const [activationRole, setActivationRole] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [statusMessage, setStatusMessage] = useState(
    isPortalActivation
      ? "Checking your portal activation..."
      : "Checking your reset session...",
  );

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setHasSession(false);
        setStatusTone("error");
        setStatusMessage("Unable to validate your session. Request a new link and try again.");
        setCheckingSession(false);
        return;
      }
      if (!session) {
        setHasSession(false);
        setStatusTone("error");
        setStatusMessage(
          isPortalActivation
            ? "This portal activation is no longer valid. Ask your shop to resend the invitation."
            : "No active reset session found. Request a new password reset link and try again.",
        );
        setCheckingSession(false);
        return;
      }
      setHasSession(true);
      setStatusTone("neutral");
      setStatusMessage("Enter your new password.");
      setCheckingSession(false);
    }
    void checkSession();
    return () => { cancelled = true; };
  }, [isPortalActivation, supabase]);

  async function finishActivation(userId: string, role: string | null) {
    const activation = await activatePasswordProfile(supabase, userId);
    if (!activation.ok) {
      console.error("[set-password] profile activation failed", {
        userId,
        detail: activation.detail,
      });
      setStatusTone("error");
      setStatusMessage(activation.userMessage);
      return false;
    }

    setStatusTone("success");
    setStatusMessage(
      isPortalActivation
        ? "Portal password created. Opening your portal..."
        : "Password updated. Redirecting...",
    );
    const redirect = safeInternalRedirect(
      searchParams.get("redirect"),
      getReturnPath(role),
      ["/dashboard", "/onboarding", "/portal", "/fleet", "/mobile"],
    );
    window.setTimeout(() => window.location.replace(redirect), 700);
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hasSession) {
      setStatusTone("error");
      setStatusMessage("No active reset session found.");
      return;
    }

    try {
      setSubmitting(true);
      setStatusTone("neutral");

      if (passwordCommitted && activationUserId) {
        setStatusMessage("Retrying account activation...");
        await finishActivation(activationUserId, activationRole);
        return;
      }

      const trimmedPassword = password.trim();
      const trimmedConfirm = confirmPassword.trim();
      if (!trimmedPassword) {
        setStatusTone("error");
        setStatusMessage("Password is required.");
        return;
      }
      if (trimmedPassword.length < 12) {
        setStatusTone("error");
        setStatusMessage("Password must be at least 12 characters.");
        return;
      }
      if (trimmedPassword !== trimmedConfirm) {
        setStatusTone("error");
        setStatusMessage("Passwords do not match.");
        return;
      }

      setStatusMessage("Saving your new password...");
      const { data, error } = await supabase.auth.updateUser({ password: trimmedPassword });
      if (error) {
        setStatusTone("error");
        setStatusMessage(error.message || "Failed to update password.");
        return;
      }

      const userId = data.user?.id ?? null;
      const role = (data.user?.user_metadata?.role as string | undefined) ?? null;
      if (!userId) {
        setStatusTone("error");
        setStatusMessage("Password updated, but the account could not be identified. Contact support.");
        return;
      }

      setPasswordCommitted(true);
      setActivationUserId(userId);
      setActivationRole(role);
      setPassword("");
      setConfirmPassword("");
      setStatusMessage("Password updated. Activating your account...");
      await finishActivation(userId, role);
    } catch (error) {
      console.error("[set-password] unexpected activation error", error);
      setStatusTone("error");
      setStatusMessage("Unable to finish account setup. Retry activation or contact support.");
    } finally {
      setSubmitting(false);
    }
  }

  const statusClass =
    statusTone === "error"
      ? "text-red-300"
      : statusTone === "success"
        ? "text-emerald-300"
        : "text-[color:var(--theme-text-secondary)]";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--theme-surface-page)] px-6 py-10 text-[color:var(--theme-text-primary)]">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          {isPortalActivation ? "Create your portal password" : "Set new password"}
        </h1>
        <p className={`mt-3 text-sm ${statusClass}`}>{statusMessage}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">New password</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={passwordCommitted ? "Password already updated" : "Enter new password"}
              disabled={checkingSession || submitting || !hasSession || passwordCommitted}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">Confirm password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={passwordCommitted ? "Password already updated" : "Confirm new password"}
              disabled={checkingSession || submitting || !hasSession || passwordCommitted}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={checkingSession || submitting || !hasSession}
          >
            {submitting
              ? passwordCommitted
                ? "Activating..."
                : "Saving..."
              : passwordCommitted
                ? "Retry account activation"
                : isPortalActivation
                  ? "Create password"
                  : "Update password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
''',
)

# ---------------------------------------------------------------------------
# Fleet conversion: exact capability, terminal-state UI gate, testable client.
# ---------------------------------------------------------------------------
write(
    "features/fleet/lib/convertFleetServiceRequest.ts",
    r'''export async function convertFleetServiceRequest(
  serviceRequestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(
    "/api/fleet/service-requests/convert-to-work-order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceRequestId }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    workOrderId?: string;
    error?: string;
  };
  if (!response.ok || !body.workOrderId) {
    throw new Error(body.error || "Unable to create work order");
  }
  return body.workOrderId;
}
''',
)
replace_once(
    "features/fleet/lib/fleetUiCapabilities.ts",
    "  canConvertRequests: boolean;\n  canCreateFleetWorkOrders: boolean;",
    "  canConvertRequests: boolean;\n  canConvertServiceRequestToWorkOrder: boolean;\n  canCreateFleetWorkOrders: boolean;",
)
replace_once(
    "features/fleet/lib/fleetUiCapabilities.ts",
    "      canConvertRequests,\n      canCreateFleetWorkOrders:",
    "      canConvertRequests,\n      canConvertServiceRequestToWorkOrder:\n        actor.capabilities.canConvertServiceRequestToWorkOrder,\n      canCreateFleetWorkOrders:",
)
replace_once(
    "features/fleet/components/FleetServiceRequestsPage.tsx",
    'import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";\n',
    'import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";\nimport { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";\n',
)
regex_once(
    "features/fleet/components/FleetServiceRequestsPage.tsx",
    r'''      const response = await fetch\(
        "/api/fleet/service-requests/convert-to-work-order",
        \{
          method: "POST",
          headers: \{ "Content-Type": "application/json" \},
          body: JSON.stringify\(\{ serviceRequestId: item.id \}\),
        \},
      \);
      const body = \(await response.json\(\).catch\(\(\) => \(\{\}\)\)\) as ConvertPayload;
      if \(!response.ok \|\| !body.workOrderId\) \{
        throw new Error\(body.error \|\| "Unable to create work order"\);
      \}

      window.location.assign\(
        `/work-orders/\$\{encodeURIComponent\(body.workOrderId\)\}`,
      \);''',
    '''      const workOrderId = await convertFleetServiceRequest(item.id);
      window.location.assign(`/work-orders/${encodeURIComponent(workOrderId)}`);''',
    flags=re.MULTILINE,
)
replace_once(
    "features/fleet/components/FleetServiceRequestsPage.tsx",
    '''                ) : routePrefix === "/fleet" &&
                  uiContext.capabilities.canConvertRequests ? (''',
    '''                ) : routePrefix === "/fleet" &&
                  uiContext.isInternal &&
                  uiContext.capabilities.canConvertServiceRequestToWorkOrder &&
                  item.status === "open" ? (''',
)

# ---------------------------------------------------------------------------
# Canonical membership rollback ordering and database-trigger ownership.
# ---------------------------------------------------------------------------
replace_once(
    "app/api/admin/create-user/route.ts",
    '''}): Promise<boolean> {
  const { error } = await args.serviceSupabase.auth.admin.deleteUser(args.authUserId);
  if (error) {''',
    '''}): Promise<boolean> {
  const cleanupTables = [
    ["shop_members", "user_id"],
    ["people_workforce_profiles", "user_id"],
    ["profiles", "id"],
  ] as const;
  for (const [table, column] of cleanupTables) {
    const { error: cleanupError } = await args.serviceSupabase
      .from(table)
      .delete()
      .eq(column, args.authUserId);
    if (cleanupError) {
      logCreateUserError("rollback_dependent_row_failed", {
        adminId: args.adminId,
        targetShopId: args.shopId,
        authUserId: args.authUserId,
        error: `${table}: ${cleanupError.message}`,
      });
      return false;
    }
  }

  const { error } = await args.serviceSupabase.auth.admin.deleteUser(args.authUserId);
  if (error) {''',
)

# ---------------------------------------------------------------------------
# Parts-role workbench and atomic create/attach inventory operation.
# ---------------------------------------------------------------------------
replace_all(
    "app/api/parts/_lib/lifecycleCommand.ts",
    'requiredCapability: "canManageWorkOrders"',
    'requiredCapability: "canManageParts"',
)
replace_all(
    "app/api/parts/_lib/receivePartRequestItem.ts",
    'requiredCapability: "canManageWorkOrders"',
    'requiredCapability: "canManageParts"',
)

write(
    "app/api/parts/requests/items/[itemId]/inventory/route.ts",
    r'''import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"] & {
  manufacturer?: string | null;
};

type Body =
  | { mode: "attach"; partId: string }
  | {
      mode: "create";
      name: string;
      partNumber?: string | null;
      manufacturer?: string | null;
      supplier?: string | null;
      sku?: string | null;
      category?: string | null;
      cost?: number | string | null;
      sellPrice?: number | string | null;
      initialQty?: number | string | null;
      locationId?: string | null;
    };

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function suppliedNumber(
  body: Record<string, unknown>,
  key: string,
): { supplied: boolean; value: number | null } {
  if (!(key in body) || body[key] == null || body[key] === "") {
    return { supplied: false, value: null };
  }
  const value = typeof body[key] === "number" ? body[key] : Number(body[key]);
  return { supplied: true, value: Number.isFinite(value) ? value : null };
}

function stableOperationKey(itemId: string, body: Extract<Body, { mode: "create" }>): string {
  const normalized = JSON.stringify({
    itemId,
    name: clean(body.name),
    partNumber: clean(body.partNumber),
    manufacturer: clean(body.manufacturer),
    supplier: clean(body.supplier),
    sku: clean(body.sku),
    category: clean(body.category),
    cost: body.cost ?? null,
    sellPrice: body.sellPrice ?? null,
    initialQty: body.initialQty ?? null,
    locationId: clean(body.locationId),
  });
  return `request-inventory:${itemId}:${createHash("sha256").update(normalized).digest("hex")}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid itemId." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageParts" });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { data: item, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("id,shop_id,part_id,requested_manufacturer")
    .eq("id", itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (itemError) {
    return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "Request item not found." }, { status: 404 });
  }

  if (body.mode === "attach") {
    if (!isUuid(body.partId)) {
      return NextResponse.json({ ok: false, error: "Invalid partId." }, { status: 400 });
    }
    const { data: part, error: partError } = await access.supabase
      .from("parts")
      .select("*")
      .eq("id", body.partId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();
    if (partError) {
      return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
    }
    if (!part) {
      return NextResponse.json({ ok: false, error: "Inventory part not found." }, { status: 404 });
    }
    const { data: updatedItem, error: updateError } = await access.supabase
      .from("part_request_items")
      .update({ part_id: part.id, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("shop_id", access.profile.shop_id)
      .select("*")
      .maybeSingle();
    if (updateError || !updatedItem) {
      return NextResponse.json(
        { ok: false, error: updateError?.message ?? "Inventory selection did not persist." },
        { status: updateError ? 500 : 409 },
      );
    }
    return NextResponse.json({ ok: true, item: updatedItem, partId: part.id, part });
  }

  const name = clean(body.name);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  }
  const cost = suppliedNumber(body as unknown as Record<string, unknown>, "cost");
  const sellPrice = suppliedNumber(body as unknown as Record<string, unknown>, "sellPrice");
  const initialQty = suppliedNumber(body as unknown as Record<string, unknown>, "initialQty");
  for (const [label, parsed] of [
    ["Cost", cost],
    ["Sell price", sellPrice],
    ["Initial quantity", initialQty],
  ] as const) {
    if (parsed.supplied && parsed.value == null) {
      return NextResponse.json({ ok: false, error: `${label} must be a valid number.` }, { status: 400 });
    }
    if ((parsed.value ?? 0) < 0) {
      return NextResponse.json({ ok: false, error: `${label} must be zero or greater.` }, { status: 400 });
    }
  }
  const locationId = clean(body.locationId);
  if ((initialQty.value ?? 0) > 0 && !isUuid(locationId)) {
    return NextResponse.json({ ok: false, error: "Location is required for initial quantity." }, { status: 400 });
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_create_and_attach_inventory_atomic", {
    p_item_id: itemId,
    p_name: name,
    p_part_number: clean(body.partNumber),
    p_manufacturer: clean(body.manufacturer) ?? clean(item.requested_manufacturer),
    p_supplier: clean(body.supplier),
    p_sku: clean(body.sku) ?? clean(body.partNumber),
    p_category: clean(body.category),
    p_cost: cost.value,
    p_sell_price: sellPrice.value,
    p_initial_qty: initialQty.value ?? 0,
    p_location_id: locationId,
    p_operation_key: stableOperationKey(itemId, body),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    part_id?: string;
    item?: unknown;
    part?: PartRow;
  } | null;
  if (!result?.part_id) {
    return NextResponse.json({ ok: false, error: "Inventory operation returned no part." }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    item: result.item ?? null,
    partId: result.part_id,
    part: result.part ?? null,
  });
}
''',
)

# Keep older safeguard tests aligned with the parts capability.
parts_test = "features/parts/components/request-workbench/partsPackageCommit.test.ts"
if (ROOT.joinpath(parts_test).exists():
    replace_all(parts_test, 'requiredCapability: "canManageWorkOrders"', 'requiredCapability: "canManageParts"')

# ---------------------------------------------------------------------------
# PO scanning: one held barcode is one operation until detection is released.
# ---------------------------------------------------------------------------
replace_once(
    "app/parts/po/[id]/receive/page.tsx",
    '''  const receiveOperationRef = useRef<{ key: string; id: string } | null>(null);
''',
    '''  const receiveOperationRef = useRef<{ key: string; id: string } | null>(null);
  const receiveBusyRef = useRef(false);
  const activeScanCodeRef = useRef<string | null>(null);
  const scanReleaseTimerRef = useRef<number | null>(null);
''',
)
replace_once(
    "app/parts/po/[id]/receive/page.tsx",
    '''    setScanning(false);
  };
''',
    '''    if (scanReleaseTimerRef.current != null) {
      window.clearTimeout(scanReleaseTimerRef.current);
      scanReleaseTimerRef.current = null;
    }
    activeScanCodeRef.current = null;
    receiveBusyRef.current = false;
    setScanning(false);
  };
''',
)
replace_once(
    "app/parts/po/[id]/receive/page.tsx",
    '''    if (!receiveQty || receiveQty <= 0) {
      setErr("Quantity must be greater than 0.");
      return;
    }
''',
    '''    if (!receiveQty || receiveQty <= 0) {
      setErr("Quantity must be greater than 0.");
      return;
    }
    if (Math.abs(receiveQty * 100 - Math.round(receiveQty * 100)) > 1e-7) {
      setErr("Quantity supports at most two decimal places.");
      return;
    }
    if (receiveBusyRef.current) return;
''',
)
replace_once(
    "app/parts/po/[id]/receive/page.tsx",
    '''    const { data, error } = await supabase.rpc(
      "receive_po_part_and_allocate",
      args as unknown as DB["public"]["Functions"]["receive_po_part_and_allocate"]["Args"],
    );

    if (error) {
      setErr(error.message);
      return;
    }

    receiveOperationRef.current = null;
''',
    '''    receiveBusyRef.current = true;
    const { data, error } = await supabase.rpc(
      "receive_po_part_and_allocate",
      args as unknown as DB["public"]["Functions"]["receive_po_part_and_allocate"]["Args"],
    );
    receiveBusyRef.current = false;

    if (error) {
      setErr(error.message);
      return;
    }

    receiveOperationRef.current = null;
''',
)
regex_once(
    "app/parts/po/[id]/receive/page.tsx",
    r'''    const handler: QuaggaDetectedHandler = async \(res\) => \{
      const code = res.codeResult\?\.code \?\? "";
      if \(!code \|\| code === lastScan\) return;

      setLastScan\(code\);

      const supplierId = po\?\.supplier_id \? String\(po.supplier_id\) : null;

      const \{ part_id \} = await resolveScannedCode\(\{
        code,
        supplier_id: supplierId,
      \}\);

      if \(!part_id\) \{
        setErr\(`No part found for "\$\{code\}"\. Map it in Parts → Inventory → Edit → Barcodes\.`\);
        window.setTimeout\(\(\) => setLastScan\(""\), 900\);
        return;
      \}

      await doReceive\(part_id, qty\);

      window.setTimeout\(\(\) => setLastScan\(""\), 900\);
    \};''',
    '''    const releaseScanAfterSilence = (code: string) => {
      if (scanReleaseTimerRef.current != null) {
        window.clearTimeout(scanReleaseTimerRef.current);
      }
      scanReleaseTimerRef.current = window.setTimeout(() => {
        if (activeScanCodeRef.current === code) {
          activeScanCodeRef.current = null;
          setLastScan("");
        }
        scanReleaseTimerRef.current = null;
      }, 900);
    };

    const handler: QuaggaDetectedHandler = async (res) => {
      const code = res.codeResult?.code ?? "";
      if (!code) return;
      if (activeScanCodeRef.current === code) {
        releaseScanAfterSilence(code);
        return;
      }
      if (receiveBusyRef.current || activeScanCodeRef.current) return;

      activeScanCodeRef.current = code;
      setLastScan(code);
      releaseScanAfterSilence(code);

      const supplierId = po?.supplier_id ? String(po.supplier_id) : null;
      const { part_id } = await resolveScannedCode({ code, supplier_id: supplierId });
      if (!part_id) {
        setErr(`No part found for "${code}". Map it in Parts → Inventory → Edit → Barcodes.`);
        return;
      }
      await doReceive(part_id, qty);
    };''',
    flags=re.MULTILINE,
)

# ---------------------------------------------------------------------------
# Canonical parts display: merge allocation details into canonical rows and
# use only unlinked allocations as standalone rows.
# ---------------------------------------------------------------------------
write(
    "features/work-orders/lib/display/workOrderParts.ts",
    r'''import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderPart = DB["public"]["Tables"]["work_order_parts"]["Row"];

export type CanonicalWorkOrderPart = WorkOrderPart & {
  id: string;
  source_parts_request_item_id?: string | null;
  part_id: string | null;
  description_snapshot?: string | null;
  part_number_snapshot?: string | null;
  manufacturer_snapshot?: string | null;
  quantity_requested?: number | null;
  quantity: number;
  unit_sell_price_snapshot?: number | null;
  unit_price: number | null;
  total_price: number | null;
  lifecycle_status?: string | null;
  is_active?: boolean | null;
  parts?: { name?: string | null; part_number?: string | null; sku?: string | null; manufacturer?: string | null; supplier?: string | null } | null;
};

type AllocationLink = {
  source_request_item_id?: string | null;
  work_order_part_id?: string | null;
  location_id?: string | null;
  qty?: number | null;
  quantity?: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getCanonicalPartQuantity(part: Pick<CanonicalWorkOrderPart, "quantity" | "quantity_requested">): number {
  return toNumber(part.quantity_requested) ?? toNumber(part.quantity) ?? 0;
}

export function getCanonicalPartUnitPrice(part: Pick<CanonicalWorkOrderPart, "unit_sell_price_snapshot" | "unit_price">): number {
  return toNumber(part.unit_sell_price_snapshot) ?? toNumber(part.unit_price) ?? 0;
}

export function getCanonicalPartTotal(part: Pick<CanonicalWorkOrderPart, "quantity" | "quantity_requested" | "unit_sell_price_snapshot" | "unit_price" | "total_price">): number {
  return toNumber(part.total_price) ?? getCanonicalPartQuantity(part) * getCanonicalPartUnitPrice(part);
}

export function getCanonicalPartDescription(part: Pick<CanonicalWorkOrderPart, "description_snapshot" | "parts">): string | null {
  return part.description_snapshot?.trim() || part.parts?.name?.trim() || null;
}

export function getCanonicalPartNumber(part: Pick<CanonicalWorkOrderPart, "part_number_snapshot" | "parts">): string | null {
  return part.part_number_snapshot?.trim() || part.parts?.part_number?.trim() || part.parts?.sku?.trim() || null;
}

export function getCanonicalPartManufacturer(part: Pick<CanonicalWorkOrderPart, "manufacturer_snapshot" | "parts">): string | null {
  return part.manufacturer_snapshot?.trim() || part.parts?.manufacturer?.trim() || part.parts?.supplier?.trim() || null;
}

export function activeCanonicalWorkOrderParts(parts: CanonicalWorkOrderPart[]): CanonicalWorkOrderPart[] {
  return parts.filter((part) => part.is_active !== false);
}

function isLinkedAllocation(
  allocation: AllocationLink,
  part: { id?: string | null; source_parts_request_item_id?: string | null },
): boolean {
  return Boolean(
    (allocation.work_order_part_id && allocation.work_order_part_id === part.id) ||
      (allocation.source_request_item_id &&
        allocation.source_request_item_id === part.source_parts_request_item_id),
  );
}

export function summarizeCanonicalPartAllocations(
  part: { id?: string | null; source_parts_request_item_id?: string | null },
  allocations: AllocationLink[],
): { allocatedQuantity: number; locations: string[] } {
  const linked = allocations.filter((allocation) => isLinkedAllocation(allocation, part));
  const allocatedQuantity = linked.reduce(
    (sum, allocation) =>
      sum + (toNumber(allocation.qty) ?? toNumber(allocation.quantity) ?? 0),
    0,
  );
  const locations = Array.from(
    new Set(
      linked
        .map((allocation) => allocation.location_id?.trim() || null)
        .filter((location): location is string => Boolean(location)),
    ),
  );
  return { allocatedQuantity, locations };
}

export function filterAllocationsNotBackedByCanonicalParts<T extends AllocationLink>(
  allocations: T[],
  canonicalParts: Array<{ id?: string | null; source_parts_request_item_id?: string | null }>,
): T[] {
  return allocations.filter(
    (allocation) =>
      !canonicalParts.some((part) => isLinkedAllocation(allocation, part)),
  );
}
''',
)

for target in [
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
]:
    replace_once(
        target,
        "  getCanonicalPartQuantity,\n",
        "  getCanonicalPartQuantity,\n  summarizeCanonicalPartAllocations,\n",
    )

# Mobile allocation details in canonical rows.
replace_once(
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    '''                        {requiredParts.map((p) => (
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
                        ))}''',
    '''                        {requiredParts.map((p) => {
                          const allocation = summarizeCanonicalPartAllocations(p, allocs);
                          const requested = getCanonicalPartQuantity(p);
                          return (
                            <li
                              key={`required-${p.id}`}
                              className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                            >
                              <div className="col-span-7 truncate text-[color:var(--theme-text-primary)]">
                                {getCanonicalPartDescription(p) ?? "—"}
                                <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
                                  {[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}
                                </div>
                              </div>
                              <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                                {allocation.locations.length > 0
                                  ? allocation.locations.map((location) => `loc ${location.slice(0, 6)}…`).join(", ")
                                  : "—"}
                              </div>
                              <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                                {allocation.allocatedQuantity > 0
                                  ? `${allocation.allocatedQuantity}/${requested}`
                                  : requested}
                              </div>
                            </li>
                          );
                        })}''',
)

# Focused modal uses filtered allocations everywhere and merges canonical details.
replace_once(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    '''  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [requiredParts, setRequiredParts] = useState<RequiredPartRow[]>([]);
''',
    '''  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [requiredParts, setRequiredParts] = useState<RequiredPartRow[]>([]);
  const displayOnlyAllocations = useMemo(
    () => filterAllocationsNotBackedByCanonicalParts(allocs, requiredParts),
    [allocs, requiredParts],
  );
''',
)
replace_all(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    "(allocs.length + requiredParts.length)",
    "(displayOnlyAllocations.length + requiredParts.length)",
)
replace_all(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    "{allocs.map((a) => {",
    "{displayOnlyAllocations.map((a) => {",
)
replace_once(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    '''                      {requiredParts.map((p) => {
                        const qty = getCanonicalPartQuantity(p);
                        const unit = getCanonicalPartUnitPrice(p);
                        return (
                          <li key={`required-${p.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                            <div className="col-span-7 min-w-0 break-words text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartDescription(p) ?? "—"}
                              <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}</div>
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">{unit > 0 ? money(unit) : "—"}</div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">{qty}</div>
                          </li>
                        );
                      })}''',
    '''                      {requiredParts.map((p) => {
                        const qty = getCanonicalPartQuantity(p);
                        const unit = getCanonicalPartUnitPrice(p);
                        const allocation = summarizeCanonicalPartAllocations(p, allocs);
                        return (
                          <li key={`required-${p.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                            <div className="col-span-7 min-w-0 break-words text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartDescription(p) ?? "—"}
                              <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}</div>
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                              {allocation.locations.length > 0
                                ? allocation.locations.map((location) => `loc ${location.slice(0, 6)}…`).join(", ")
                                : unit > 0 ? money(unit) : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                              {allocation.allocatedQuantity > 0 ? `${allocation.allocatedQuantity}/${qty}` : qty}
                            </div>
                          </li>
                        );
                      })}''',
)

# Separate technician execution notes from commercial/customer-visible notes.
replace_once(
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    'type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];',
    'type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"] & { technician_notes?: string | null };',
)
replace_once(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    'type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];',
    'type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"] & { technician_notes?: string | null };',
)
replace_all(
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    "cached.line.notes ?? \"\"",
    "cached.line.technician_notes ?? \"\"",
)
replace_all(
    "features/work-orders/mobile/MobileFocusedJob.tsx",
    "l?.notes ?? \"\"",
    "l?.technician_notes ?? \"\"",
)
replace_all(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    "l?.notes ?? \"\"",
    "l?.technician_notes ?? \"\"",
)
replace_all(
    "features/work-orders/components/workorders/FocusedJobModal.tsx",
    "notes: techNotes,",
    "technician_notes: techNotes,",
)

# ---------------------------------------------------------------------------
# Superseding database migration: applied and unapplied migration hardening.
# ---------------------------------------------------------------------------
write(
    "supabase/migrations/20260804120000_codex_review_followup_hardening.sql",
    r'''begin;

-- -------------------------------------------------------------------------
-- Canonical shop membership is owned by the profile lifecycle, not by one API.
-- -------------------------------------------------------------------------
create or replace function public.canonical_shop_membership_role(p_role text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'service_advisor' then 'service'
    when 'service advisor' then 'service'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    when 'lead' then 'lead_hand'
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'foreman' then 'foreman'
    when 'lead_hand' then 'lead_hand'
    when 'advisor' then 'advisor'
    when 'service' then 'service'
    when 'dispatcher' then 'dispatcher'
    when 'parts' then 'parts'
    when 'mechanic' then 'mechanic'
    when 'fleet_manager' then 'fleet_manager'
    when 'driver' then 'driver'
    when 'viewer' then 'viewer'
    else null
  end;
$$;

alter table public.shop_members drop constraint if exists shop_members_role_check;
alter table public.shop_members add constraint shop_members_role_check check (
  role = any (array[
    'owner','admin','manager','foreman','lead_hand','advisor','service',
    'dispatcher','parts','mechanic','fleet_manager','driver','viewer'
  ]::text[])
);

create or replace function public.sync_profile_shop_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.canonical_shop_membership_role(new.role::text);
  v_created_by uuid;
begin
  if tg_op = 'UPDATE' and old.shop_id is not null and old.shop_id is distinct from new.shop_id then
    delete from public.shop_members
    where shop_id = old.shop_id and user_id = old.id;
  end if;

  if new.shop_id is null or v_role is null then
    delete from public.shop_members where user_id = new.id;
    return new;
  end if;

  select new.created_by
    into v_created_by
  where new.created_by is not null
    and exists (select 1 from public.profiles creator where creator.id = new.created_by);

  insert into public.shop_members(shop_id,user_id,role,created_by)
  values (new.shop_id,new.id,v_role,v_created_by)
  on conflict (shop_id,user_id)
  do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_shop_membership on public.profiles;
create trigger trg_profiles_sync_shop_membership
after insert or update of shop_id, role on public.profiles
for each row execute function public.sync_profile_shop_membership();

insert into public.shop_members(shop_id,user_id,role,created_by)
select
  profile.shop_id,
  profile.id,
  public.canonical_shop_membership_role(profile.role::text),
  case when exists (
    select 1 from public.profiles creator where creator.id = profile.created_by
  ) then profile.created_by else null end
from public.profiles profile
where profile.shop_id is not null
  and public.canonical_shop_membership_role(profile.role::text) is not null
on conflict (shop_id,user_id)
do update set role = excluded.role;

-- -------------------------------------------------------------------------
-- Service-role booking writes retain lifecycle checks. Slot eligibility is
-- validated by the trusted start route before this trigger is reached.
-- -------------------------------------------------------------------------
create or replace function public.guard_customer_booking_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_user_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'INSERT' then
      if coalesce(new.status, 'pending') <> 'pending' then
        raise exception 'Portal bookings must begin as pending';
      end if;
      return new;
    end if;
    if old.status in ('cancelled','completed')
       and new.status is distinct from old.status then
      raise exception 'Completed or cancelled bookings cannot be changed';
    end if;
    if old.status = 'confirmed' and new.status = 'pending' then
      raise exception 'Confirmed bookings cannot return to pending';
    end if;
    return new;
  end if;

  if public.is_staff_for_shop(new.shop_id) then return new; end if;

  select customer.user_id into v_customer_user_id
  from public.customers customer where customer.id = new.customer_id;
  if v_customer_user_id is distinct from auth.uid() then
    raise exception 'Booking does not belong to the current customer';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'Customer bookings must begin as pending';
    end if;
    return new;
  end if;
  if old.status in ('cancelled','completed') and new.status is distinct from old.status then
    raise exception 'Completed or cancelled bookings cannot be changed';
  end if;
  if new.status is distinct from old.status
     and not (old.status in ('pending','confirmed') and new.status = 'cancelled') then
    raise exception 'Customers may only cancel an active booking';
  end if;
  if new.shop_id is distinct from old.shop_id
     or new.customer_id is distinct from old.customer_id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.work_order_id is distinct from old.work_order_id
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.notes is distinct from old.notes then
    raise exception 'Customers cannot edit protected booking fields';
  end if;
  return new;
end;
$$;

-- Fleet request conversion is legal only from an open request. This trigger
-- rolls back the entire conversion RPC, including any work-order insert.
create or replace function public.guard_fleet_request_conversion_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.work_order_id is null and new.work_order_id is not null and old.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'FLEET_REQUEST_NOT_CONVERTIBLE';
  end if;
  if old.status in ('completed','closed','cancelled','declined','rejected')
     and new.status is distinct from old.status then
    raise exception using errcode = 'P0001', message = 'FLEET_REQUEST_TERMINAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fleet_request_conversion_state on public.fleet_service_requests;
create trigger trg_fleet_request_conversion_state
before update of status, work_order_id on public.fleet_service_requests
for each row execute function public.guard_fleet_request_conversion_state();

-- -------------------------------------------------------------------------
-- Inventory snapshots: direct ledger writers still update legacy caches,
-- while the canonical apply_stock_move core is not counted twice.
-- -------------------------------------------------------------------------
create or replace function public.apply_stock_move_to_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.metadata->>'operation', '') = 'apply_stock_move' then
    return new;
  end if;
  insert into public.part_stock(part_id,location_id,qty_on_hand,qty_reserved)
  values (new.part_id,new.location_id,new.qty_change,0)
  on conflict (part_id,location_id)
  do update set qty_on_hand = public.part_stock.qty_on_hand + excluded.qty_on_hand;
  return new;
end;
$$;

drop trigger if exists trg_stock_moves_apply_snapshot on public.stock_moves;
create trigger trg_stock_moves_apply_snapshot
after insert on public.stock_moves
for each row execute function public.apply_stock_move_to_snapshot();

create index if not exists stock_moves_shop_reference_idx
on public.stock_moves(shop_id,reference_kind,reference_id,part_id);

create table if not exists public.inventory_reconciliation_exceptions(
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  missing_quantity numeric(12,2) not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(shop_id,purchase_order_id,part_id,reason)
);

create or replace function public.receive_po_part_and_allocate(
  p_po_id uuid,
  p_part_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_shop_id uuid;
  v_po_status text;
  v_operation_key text;
  v_move public.stock_moves%rowtype;
  v_result jsonb;
  v_po_remaining numeric;
  v_remaining numeric;
  v_po_closed boolean := false;
  v_item record;
  v_target numeric;
  v_received numeric;
  v_need numeric;
  v_take numeric;
  v_alloc jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='Not authenticated'; end if;
  if p_po_id is null or p_part_id is null or p_location_id is null or p_operation_id is null then
    raise exception using errcode='22023',message='PO, part, location, and operation id are required';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty::text in ('NaN','Infinity','-Infinity')
     or round(p_qty,2) is distinct from p_qty then
    raise exception using errcode='22023',message='Receipt quantity must be positive with at most two decimal places';
  end if;

  select purchase_order.shop_id,purchase_order.status::text
    into v_shop_id,v_po_status
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;
  if v_shop_id is null then raise exception using errcode='P0002',message='Purchase order not found'; end if;

  if not exists (
    select 1 from public.profiles profile
    where (profile.id = v_uid or profile.user_id = v_uid)
      and profile.shop_id = v_shop_id
      and public.canonical_shop_membership_role(profile.role::text)
        in ('owner','admin','manager','lead_hand','foreman','parts')
  ) then
    raise exception using errcode='42501',message='Parts permission required';
  end if;
  if not exists (select 1 from public.parts part where part.id=p_part_id and part.shop_id=v_shop_id) then
    raise exception using errcode='42501',message='Part does not belong to purchase-order shop';
  end if;
  if not exists (select 1 from public.stock_locations location where location.id=p_location_id and location.shop_id=v_shop_id) then
    raise exception using errcode='42501',message='Location does not belong to purchase-order shop';
  end if;

  v_operation_key := v_shop_id::text || ':po-receive:' || p_operation_id::text;
  select move.* into v_move
  from public.stock_moves move
  where move.shop_id=v_shop_id and move.idempotency_key=v_operation_key
  for update;
  if found then
    if v_move.part_id is distinct from p_part_id
       or v_move.location_id is distinct from p_location_id
       or v_move.qty_change is distinct from p_qty
       or v_move.reference_kind is distinct from 'purchase_order'
       or v_move.reference_id is distinct from p_po_id then
      raise exception using errcode='22023',message='PO_RECEIVE_IDEMPOTENCY_CONFLICT';
    end if;
    return coalesce(v_move.metadata->'receipt_result','{}'::jsonb)
      || jsonb_build_object('ok',true,'replayed',true,'move_id',v_move.id);
  end if;

  perform 1 from public.purchase_order_lines line
  where line.po_id=p_po_id and line.part_id=p_part_id
  order by line.created_at,line.id for update;
  select coalesce(sum(greatest(coalesce(line.qty,0)-coalesce(line.received_qty,0),0)),0)
    into v_po_remaining
  from public.purchase_order_lines line
  where line.po_id=p_po_id and line.part_id=p_part_id;
  if v_po_remaining <= 0 then raise exception using errcode='22023',message='PO_PART_FULLY_RECEIVED'; end if;
  if p_qty > v_po_remaining then
    raise exception using errcode='22023',message=format('PO_RECEIVE_QUANTITY_EXCEEDS_REMAINING requested=%s remaining=%s',p_qty,v_po_remaining);
  end if;

  insert into public.stock_moves(
    shop_id,part_id,location_id,qty_change,reason,reference_kind,reference_id,
    created_by,idempotency_key,metadata,lifecycle_quantity
  ) values (
    v_shop_id,p_part_id,p_location_id,p_qty,'receive','purchase_order',p_po_id,
    v_uid,v_operation_key,
    jsonb_build_object('operation','purchase_order_receipt','operation_id',p_operation_id,'po_id',p_po_id),
    p_qty
  ) returning * into v_move;

  v_remaining := p_qty;
  for v_item in
    select line.id,line.qty,line.received_qty
    from public.purchase_order_lines line
    where line.po_id=p_po_id and line.part_id=p_part_id
    order by line.created_at,line.id for update
  loop
    exit when v_remaining <= 0;
    v_need := greatest(coalesce(v_item.qty,0)-coalesce(v_item.received_qty,0),0);
    v_take := least(v_remaining,v_need);
    if v_take > 0 then
      update public.purchase_order_lines set received_qty=coalesce(received_qty,0)+v_take where id=v_item.id;
      v_remaining := v_remaining-v_take;
    end if;
  end loop;
  if v_remaining <> 0 then raise exception using errcode='P0001',message='PO_RECEIVE_LINE_RECONCILIATION_FAILED'; end if;

  if exists (
    select 1 from public.purchase_order_lines line
    where line.po_id=p_po_id and coalesce(line.received_qty,0)<coalesce(line.qty,0)
  ) then
    v_po_closed := false;
  else
    update public.purchase_orders set status='received' where id=p_po_id;
    v_po_closed := true;
  end if;
  select status::text into v_po_status from public.purchase_orders where id=p_po_id;

  v_remaining := p_qty;
  for v_item in
    select item.id,item.qty,item.qty_requested,item.qty_approved,item.qty_received
    from public.part_request_items item
    where item.shop_id=v_shop_id and item.part_id=p_part_id
      and item.status in ('approved','reserved','ordered','picking','picked','partially_received')
      and greatest(coalesce(item.qty_approved,0),coalesce(item.qty_requested,0),coalesce(item.qty,0),0)
          > greatest(coalesce(item.qty_received,0),0)
    order by item.created_at,item.id for update
  loop
    exit when v_remaining <= 0;
    v_target := greatest(coalesce(v_item.qty_approved,0),coalesce(v_item.qty_requested,0),coalesce(v_item.qty,0),0);
    v_received := greatest(coalesce(v_item.qty_received,0),0);
    v_need := greatest(v_target-v_received,0);
    v_take := least(v_remaining,v_need);
    if v_take > 0 then
      update public.part_request_items
      set qty_received=v_received+v_take,
          status=case when v_received+v_take>=v_target then 'received'::public.part_request_item_status else 'partially_received'::public.part_request_item_status end
      where id=v_item.id;
      v_alloc := v_alloc || jsonb_build_object('request_item_id',v_item.id,'qty_allocated',v_take);
      v_remaining := v_remaining-v_take;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok',true,'replayed',false,'move_id',v_move.id,'po_id',p_po_id,
    'po_closed',v_po_closed,'po_status',v_po_status,'part_id',p_part_id,
    'qty_received_total',p_qty,'allocations',v_alloc,'unallocated_qty',greatest(v_remaining,0)
  );
  update public.stock_moves
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('receipt_result',v_result)
  where id=v_move.id;
  return v_result;
end;
$$;

create or replace function public.receive_po_part_and_allocate(
  p_po_id uuid,p_part_id uuid,p_location_id uuid,p_qty numeric
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.receive_po_part_and_allocate(p_po_id,p_part_id,p_location_id,p_qty,gen_random_uuid());
$$;

revoke all on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) from public,anon;
revoke all on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric,uuid) from public,anon;
grant execute on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric) to authenticated,service_role;
grant execute on function public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric,uuid) to authenticated,service_role;

-- Reconcile provable historical gaps where one PO/part has exactly one known
-- receipt location. Ambiguous rows are surfaced for explicit review.
with line_totals as (
  select po.shop_id,line.po_id,line.part_id,round(sum(coalesce(line.received_qty,0)),2) received_qty
  from public.purchase_order_lines line
  join public.purchase_orders po on po.id=line.po_id
  group by po.shop_id,line.po_id,line.part_id
), move_totals as (
  select move.shop_id,move.reference_id po_id,move.part_id,
         round(sum(move.qty_change),2) moved_qty,
         count(distinct move.location_id) location_count,
         min(move.location_id) location_id
  from public.stock_moves move
  where move.reference_kind='purchase_order' and move.reason='receive'
  group by move.shop_id,move.reference_id,move.part_id
), gaps as (
  select line.shop_id,line.po_id,line.part_id,
         round(line.received_qty-coalesce(move.moved_qty,0),2) missing_qty,
         coalesce(move.location_count,0) location_count,move.location_id
  from line_totals line
  left join move_totals move
    on move.shop_id=line.shop_id and move.po_id=line.po_id and move.part_id=line.part_id
  where line.received_qty>coalesce(move.moved_qty,0)
)
insert into public.stock_moves(
  shop_id,part_id,location_id,qty_change,reason,reference_kind,reference_id,
  idempotency_key,metadata,lifecycle_quantity
)
select gap.shop_id,gap.part_id,gap.location_id,gap.missing_qty,'receive','purchase_order',gap.po_id,
       gap.shop_id::text||':po-reconcile:'||gap.po_id::text||':'||gap.part_id::text,
       jsonb_build_object('operation','historical_po_receipt_reconciliation','missing_quantity',gap.missing_qty),
       gap.missing_qty
from gaps gap
where gap.missing_qty>0 and gap.location_count=1 and gap.location_id is not null
on conflict (shop_id,idempotency_key) where idempotency_key is not null do nothing;

with line_totals as (
  select po.shop_id,line.po_id,line.part_id,round(sum(coalesce(line.received_qty,0)),2) received_qty
  from public.purchase_order_lines line join public.purchase_orders po on po.id=line.po_id
  group by po.shop_id,line.po_id,line.part_id
), move_totals as (
  select move.shop_id,move.reference_id po_id,move.part_id,round(sum(move.qty_change),2) moved_qty,
         count(distinct move.location_id) location_count
  from public.stock_moves move
  where move.reference_kind='purchase_order' and move.reason='receive'
  group by move.shop_id,move.reference_id,move.part_id
)
insert into public.inventory_reconciliation_exceptions(
  shop_id,purchase_order_id,part_id,missing_quantity,reason,details
)
select line.shop_id,line.po_id,line.part_id,
       round(line.received_qty-coalesce(move.moved_qty,0),2),
       'ambiguous_po_receipt_location',
       jsonb_build_object('received_qty',line.received_qty,'ledger_qty',coalesce(move.moved_qty,0),'location_count',coalesce(move.location_count,0))
from line_totals line
left join move_totals move
  on move.shop_id=line.shop_id and move.po_id=line.po_id and move.part_id=line.part_id
where line.received_qty>coalesce(move.moved_qty,0)
  and coalesce(move.location_count,0)<>1
on conflict (shop_id,purchase_order_id,part_id,reason)
do update set missing_quantity=excluded.missing_quantity,details=excluded.details;

-- Atomic, idempotent inventory creation + initial stock + request linkage.
create or replace function public.parts_create_and_attach_inventory_atomic(
  p_item_id uuid,
  p_name text,
  p_part_number text,
  p_manufacturer text,
  p_supplier text,
  p_sku text,
  p_category text,
  p_cost numeric,
  p_sell_price numeric,
  p_initial_qty numeric,
  p_location_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.part_request_items%rowtype;
  v_existing public.parts_operation_keys%rowtype;
  v_operation_id uuid := gen_random_uuid();
  v_part public.parts%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='Not authenticated'; end if;
  if nullif(trim(p_operation_key),'') is null then raise exception using errcode='22023',message='Stable operation key required'; end if;
  if nullif(trim(p_name),'') is null then raise exception using errcode='22023',message='Part name required'; end if;
  if (p_cost is not null and (p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity')))
     or (p_sell_price is not null and (p_sell_price<0 or p_sell_price::text in ('NaN','Infinity','-Infinity')))
     or p_initial_qty<0 or p_initial_qty::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='Invalid inventory numeric value';
  end if;
  if p_initial_qty>0 and p_location_id is null then raise exception using errcode='22023',message='Location required for initial stock'; end if;

  select * into v_item from public.part_request_items item where item.id=p_item_id for update;
  if not found then raise exception using errcode='P0002',message='Request item not found'; end if;
  if not exists (
    select 1 from public.profiles profile
    where (profile.id=v_uid or profile.user_id=v_uid)
      and profile.shop_id=v_item.shop_id
      and public.canonical_shop_membership_role(profile.role::text)
        in ('owner','admin','manager','lead_hand','foreman','parts')
  ) then raise exception using errcode='42501',message='Parts permission required'; end if;

  select * into v_existing from public.parts_operation_keys operation
  where operation.shop_id=v_item.shop_id and operation.operation_key=p_operation_key for update;
  if found then
    if v_existing.operation_type<>'create_attach_inventory' or v_existing.aggregate_id<>p_item_id then
      raise exception using errcode='22023',message='PARTS_OPERATION_KEY_CONFLICT';
    end if;
    if v_existing.result is not null then return v_existing.result||jsonb_build_object('idempotent',true); end if;
    raise exception using errcode='P0001',message='PARTS_OPERATION_IN_PROGRESS';
  end if;

  insert into public.parts_operation_keys(
    id,shop_id,operation_key,operation_type,aggregate_type,aggregate_id,created_by
  ) values (
    v_operation_id,v_item.shop_id,p_operation_key,'create_attach_inventory','part_request_item',p_item_id,v_uid
  );

  insert into public.parts(
    shop_id,name,part_number,sku,category,cost,default_cost,price,default_price,manufacturer,supplier
  ) values (
    v_item.shop_id,trim(p_name),nullif(trim(p_part_number),''),nullif(trim(p_sku),''),
    nullif(trim(p_category),''),p_cost,p_cost,p_sell_price,p_sell_price,
    nullif(trim(p_manufacturer),''),nullif(trim(p_supplier),'')
  ) returning * into v_part;

  if p_initial_qty>0 then
    perform public.apply_stock_move(
      v_part.id,p_location_id,p_initial_qty,'receive'::text,
      'parts_request_initial_stock',v_operation_id
    );
  end if;

  update public.part_request_items
  set part_id=v_part.id,updated_at=now()
  where id=p_item_id and shop_id=v_item.shop_id;

  v_result := jsonb_build_object(
    'ok',true,'idempotent',false,'part_id',v_part.id,
    'part',to_jsonb(v_part),
    'item',(select to_jsonb(item) from public.part_request_items item where item.id=p_item_id)
  );
  update public.parts_operation_keys
  set result=v_result,completed_at=now()
  where id=v_operation_id;
  return v_result;
end;
$$;

revoke all on function public.parts_create_and_attach_inventory_atomic(
  uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text
) from public,anon;
grant execute on function public.parts_create_and_attach_inventory_atomic(
  uuid,text,text,text,text,text,text,numeric,numeric,numeric,uuid,text
) to authenticated,service_role;

-- -------------------------------------------------------------------------
-- Technician execution notes are separate from commercial approval content.
-- -------------------------------------------------------------------------
alter table public.work_order_lines add column if not exists technician_notes text;

create or replace function public.apply_offline_line_mutation_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_action_type text,
  p_work_order_line_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_line public.work_order_lines%rowtype;
  v_role text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_payload_hash text := encode(digest(coalesce(p_payload,'{}'::jsonb)::text,'sha256'),'hex');
  v_base_updated_at timestamptz;
  v_result jsonb;
begin
  if auth.uid() is not null and auth.uid()<>p_actor_user_id then raise exception using errcode='P0001',message='Authenticated actor does not match the mutation actor.'; end if;
  if nullif(trim(p_operation_key),'') is null or length(p_operation_key)>240 then raise exception using errcode='P0001',message='A stable operation key is required.'; end if;
  if p_action_type not in ('update_work_order_line_notes','save_story_draft') then raise exception using errcode='P0001',message='Unsupported offline line mutation.'; end if;

  select * into v_existing from public.offline_mutation_receipts receipt
  where receipt.shop_id=p_shop_id and receipt.operation_key=p_operation_key;
  if found then
    if v_existing.action_type<>p_action_type or v_existing.payload_hash<>v_payload_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.'; end if;
    return v_existing.result||jsonb_build_object('idempotent',true,'receipt_id',v_existing.id);
  end if;

  select lower(coalesce(profile.role::text,'')) into v_role
  from public.profiles profile where profile.id=p_actor_user_id and profile.shop_id=p_shop_id;
  if not found then raise exception using errcode='P0001',message='Actor is not available for this shop.'; end if;

  select * into v_line from public.work_order_lines line
  where line.id=p_work_order_line_id and line.shop_id=p_shop_id for update;
  if not found then raise exception using errcode='P0001',message='Work-order line not found for shop.'; end if;
  if v_line.voided_at is not null
     or lower(coalesce(v_line.status::text,'')) not in (
       'awaiting','assigned','queued','approved','in_progress','on_hold','paused','waiting_parts'
     ) then
    raise exception using errcode='P0001',message='Work-order line is not active.';
  end if;
  if v_role not in ('owner','admin','manager','advisor','service','lead_hand','lead hand','leadhand','foreman')
     and v_line.assigned_tech_id is distinct from p_actor_user_id
     and not exists (
       select 1 from public.work_order_line_technicians assignment
       where assignment.work_order_line_id=p_work_order_line_id and assignment.technician_id=p_actor_user_id
     ) then raise exception using errcode='P0001',message='Actor is not assigned to this work-order line.'; end if;

  if nullif(trim(v_payload->>'baseUpdatedAt'),'') is not null then
    begin v_base_updated_at := (v_payload->>'baseUpdatedAt')::timestamptz;
    exception when invalid_datetime_format then raise exception using errcode='P0001',message='Invalid offline base version.'; end;
    if v_line.updated_at is distinct from v_base_updated_at then raise exception using errcode='P0001',message='OFFLINE_VERSION_CONFLICT: this job changed on another device. Review the server state before retrying.'; end if;
  end if;

  if p_action_type='update_work_order_line_notes' then
    update public.work_order_lines set technician_notes=coalesce(v_payload->>'notes',''),updated_at=now()
    where id=p_work_order_line_id and shop_id=p_shop_id;
  else
    update public.work_order_lines
    set cause=coalesce(v_payload->>'cause',''),correction=coalesce(v_payload->>'correction',''),updated_at=now()
    where id=p_work_order_line_id and shop_id=p_shop_id;
  end if;

  v_result := jsonb_build_object('ok',true,'idempotent',false,'action_type',p_action_type,'work_order_id',v_line.work_order_id,'work_order_line_id',p_work_order_line_id,'completed_at',now());
  insert into public.offline_mutation_receipts(
    shop_id,actor_user_id,operation_key,action_type,payload_hash,entity_type,entity_id,result
  ) values (
    p_shop_id,p_actor_user_id,p_operation_key,p_action_type,v_payload_hash,'work_order_line',p_work_order_line_id,v_result
  ) returning id into v_receipt_id;
  return v_result||jsonb_build_object('receipt_id',v_receipt_id);
exception when unique_violation then
  select * into v_existing from public.offline_mutation_receipts receipt
  where receipt.shop_id=p_shop_id and receipt.operation_key=p_operation_key;
  if found and v_existing.action_type=p_action_type and v_existing.payload_hash=v_payload_hash then
    return v_existing.result||jsonb_build_object('idempotent',true,'receipt_id',v_existing.id);
  end if;
  raise exception using errcode='P0001',message='IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

revoke all on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) from public,anon;
grant execute on function public.apply_offline_line_mutation_atomic(uuid,uuid,text,text,uuid,jsonb) to authenticated,service_role;

-- Shared-line completion cannot strand another technician's active segment.
-- Awaiting lines without a segment must not retain half of a legacy mirror pair.
create or replace function public.guard_work_order_line_punch_mirrors()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status::text='completed' and exists (
    select 1 from public.work_order_line_labor_segments segment
    where segment.work_order_line_id=new.id and segment.ended_at is null
  ) then
    raise exception using errcode='P0001',message='OTHER_TECHNICIANS_STILL_PUNCHED_IN';
  end if;
  if new.status::text in ('awaiting','assigned','queued') and not exists (
    select 1 from public.work_order_line_labor_segments segment
    where segment.work_order_line_id=new.id and segment.ended_at is null
  ) then
    new.punched_in_at := null;
    new.punched_out_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_order_line_punch_mirrors on public.work_order_lines;
create trigger trg_work_order_line_punch_mirrors
before update of status,punched_in_at,punched_out_at on public.work_order_lines
for each row execute function public.guard_work_order_line_punch_mirrors();

notify pgrst,'reload schema';
commit;
''',
)

# ---------------------------------------------------------------------------
# Focused regression coverage for the corrected review findings.
# ---------------------------------------------------------------------------
write(
    "tests/codex-review-followup-hardening.test.ts",
    r'''import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  activatePasswordProfile,
  PASSWORD_ACTIVATION_RETRY_MESSAGE,
} from "@/features/auth/lib/passwordActivation";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";
import {
  filterAllocationsNotBackedByCanonicalParts,
  summarizeCanonicalPartAllocations,
} from "@/features/work-orders/lib/display/workOrderParts";

const read = (path: string) => readFileSync(path, "utf8");

describe("Codex review follow-up hardening", () => {
  it("keeps password activation retryable without exposing database details", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "raw postgres policy detail" } });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const result = await activatePasswordProfile({ from } as never, "user-id");
    expect(result).toEqual({
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: "raw postgres policy detail",
    });
    expect(PASSWORD_ACTIVATION_RETRY_MESSAGE).not.toContain("postgres");
  });

  it("executes fleet conversion through a testable request boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workOrderId: "wo-1" }),
    });
    await expect(convertFleetServiceRequest("request-1", fetchMock as never)).resolves.toBe("wo-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fleet/service-requests/convert-to-work-order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ serviceRequestId: "request-1" }),
      }),
    );
  });

  it("merges linked allocation details while retaining only standalone rows", () => {
    const part = { id: "part-row", source_parts_request_item_id: "request-item" };
    const allocations = [
      { id: "linked-1", work_order_part_id: "part-row", location_id: "loc-a", qty: 4 },
      { id: "linked-2", source_request_item_id: "request-item", location_id: "loc-b", qty: 2 },
      { id: "manual", work_order_part_id: null, source_request_item_id: null, location_id: "loc-c", qty: 1 },
    ];
    expect(summarizeCanonicalPartAllocations(part, allocations)).toEqual({
      allocatedQuantity: 6,
      locations: ["loc-a", "loc-b"],
    });
    expect(filterAllocationsNotBackedByCanonicalParts(allocations, [part])).toEqual([
      allocations[2],
    ]);
  });

  it("contains the database guards required by the reviewed migrations", () => {
    const migration = read("supabase/migrations/20260804120000_codex_review_followup_hardening.sql");
    for (const contract of [
      "sync_profile_shop_membership",
      "FLEET_REQUEST_NOT_CONVERTIBLE",
      "operation', 'apply_stock_move",
      "stock_moves_shop_reference_idx",
      "historical_po_receipt_reconciliation",
      "parts_create_and_attach_inventory_atomic",
      "technician_notes",
      "OTHER_TECHNICIANS_STILL_PUNCHED_IN",
      "round(p_qty,2) is distinct from p_qty",
      "'owner','admin','manager','lead_hand','foreman','parts'",
    ]) {
      expect(migration).toContain(contract);
    }
  });

  it("keeps mobile optimistic shift state and exact fleet conversion capability", () => {
    expect(read("features/mobile/components/MobileShiftTracker.tsx")).toContain(
      'new CustomEvent("profixiq:mobile-shift-updated"',
    );
    expect(read("features/mobile/dashboard/MobileTechHome.tsx")).toContain(
      "if (detail?.queued || !navigator.onLine) return",
    );
    expect(read("features/fleet/components/FleetServiceRequestsPage.tsx")).toContain(
      "canConvertServiceRequestToWorkOrder",
    );
    expect(read("features/fleet/components/FleetServiceRequestsPage.tsx")).toContain(
      'item.status === "open"',
    );
  });

  it("requires validated work orders and parts permissions across the workbench", () => {
    const createPage = read("features/work-orders/app/work-orders/create/page.tsx");
    expect(createPage).toContain("workOrderId={hasValidatedWorkOrder");
    expect(createPage).toContain("disabled={!hasValidatedWorkOrder}");
    expect(read("app/api/parts/_lib/lifecycleCommand.ts")).toContain(
      'requiredCapability: "canManageParts"',
    );
    expect(read("app/api/parts/_lib/receivePartRequestItem.ts")).toContain(
      'requiredCapability: "canManageParts"',
    );
  });
});
''',
)

# Remove the temporary patch mechanism from the resulting commit.
(ROOT / ".github/workflows/apply-codex-review-followups.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
