import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = () => readFileSync("app/api/mobile/shifts/route.ts", "utf8");
const rpcMigration = () => readFileSync("supabase/manual/20260710_workforce_w0_transactional_shift_lifecycle.sql", "utf8");

describe("mobile shift lifecycle hardening", () => {

  it("routes the visible desktop Start Shift button through /api/mobile/shifts without legacy tech_shifts status inserts", () => {
    const source = readFileSync("features/shared/components/ShiftTracker.tsx", "utf8");

    expect(source).toContain('fetch("/api/mobile/shifts"');
    expect(source).toContain('body: JSON.stringify({ action })');
    expect(source).not.toContain('.from("tech_shifts")');
    expect(source).not.toContain('status: "open"');
    expect(source).not.toContain('.eq("status", "open")');
    expect(source).not.toContain('/api/time/shift/end');
  });

  it("normalizes the tech_shifts status default to active", () => {
    const sql = readFileSync("supabase/manual/20260710_workforce_w0_normalize_tech_shift_status.sql", "utf8");

    expect(sql).toContain("alter column status set default 'active'");
    expect(sql).toContain("when status = 'open' then 'active'");
    expect(sql).toContain("when status in ('closed', 'ended') then 'completed'");
  });

  it("starts shifts through the transactional RPC instead of manual insert/delete compensation", () => {
    const source = routeSource();

    expect(source).toContain('.rpc("start_canonical_shift"');
    expect(source).toContain("p_shop_id: shopId");
    expect(source).toContain("p_user_id: a.me.id");
    expect(source).toContain("start_canonical_shift failed");
    expect(source).not.toContain('.from("tech_shifts").insert');
    expect(source).not.toContain('.from("tech_shifts").delete()');
  });

  it("completes shifts through the transactional RPC instead of partial auto-close/update compensation", () => {
    const source = routeSource();

    expect(source).toContain('.rpc("complete_canonical_shift"');
    expect(source).toContain("p_shift_id: current.id");
    expect(source).toContain("complete_canonical_shift failed");
    expect(source).not.toContain('.from("tech_shifts").update');
    expect(source).not.toContain('.from("punch_events").delete()');
  });

  it("keeps break and lunch as checked append-only writes guarded by route ordering", () => {
    const source = routeSource();

    expect(source).toContain("Punch event insert failed");
    expect(source).toContain("Cannot start break unless currently working");
    expect(source).toContain("Cannot end break when not on break");
    expect(source).toContain("Cannot start lunch unless currently working");
    expect(source).toContain("Cannot end lunch when not on lunch");
    expect(source).toContain("return NextResponse.json({ ok: true, ...toDto(current");
  });

  it("defines atomic start and complete RPCs with narrow grants and explicit search_path", () => {
    const sql = rpcMigration();

    expect(sql).toContain("create or replace function public.start_canonical_shift");
    expect(sql).toContain("create or replace function public.complete_canonical_shift");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("for update");
    expect(sql).toContain("grant execute on function public.start_canonical_shift");
    expect(sql).toContain("grant execute on function public.complete_canonical_shift");
  });

  it("documents rollback and tenant-isolation contracts in the RPC migration", () => {
    const sql = rpcMigration();

    expect(sql).toContain("ts.shop_id = p_shop_id");
    expect(sql).toContain("ts.user_id = p_user_id");
    expect(sql).toContain("Active shift already exists");
    expect(sql).toContain("No matching active shift in this shop/user");
    expect(sql).toContain("no shop_id");
  });

  it("auto-closes break/lunch before end_shift with deterministic end_shift ordering", () => {
    const sql = rpcMigration();

    expect(sql).toContain("v_latest_event_type = 'break_start'");
    expect(sql).toContain("'break_end'");
    expect(sql).toContain("v_latest_event_type = 'lunch_start'");
    expect(sql).toContain("'lunch_end'");
    expect(sql).toContain("p_timestamp + interval '1 microsecond'");
    expect(sql).toContain("when 'end_shift' then 3");
  });
});

describe("canonical tech_shifts write routing", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("keeps technician shift controls routed through /api/mobile/shifts", () => {
    for (const path of [
      "features/shared/components/ShiftTracker.tsx",
      "features/shared/components/ui/PunchController.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain('/api/mobile/shifts');
      expect(source).not.toContain('.from("tech_shifts")');
      expect(source).not.toContain(".from('tech_shifts')");
    }
    const mobileTracker = read(
      "features/mobile/components/MobileShiftTracker.tsx",
    );
    const mobileOffline = read("features/mobile/shifts/offline.ts");
    expect(mobileTracker).toContain("runMobileShiftAction");
    expect(mobileOffline).toContain('fetch("/api/mobile/shifts"');
    expect(mobileTracker).not.toContain('.from("tech_shifts")');
    expect(mobileOffline).not.toContain('.from("tech_shifts")');
  });

  it("prevents admin scheduling shift endpoints from writing tech_shifts directly", () => {
    for (const path of [
      "app/api/scheduling/shifts/route.ts",
      "app/api/scheduling/shifts/[id]/route.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("Shift lifecycle writes must use the canonical shift API.");
      expect(source).not.toMatch(/from\(["']tech_shifts["']\)\.(insert|update|upsert|delete)\b/);
    }
  });

  it("keeps legacy time shift end completion on the canonical RPC", () => {
    const source = read("app/api/time/shift/end/route.ts");
    expect(source).toContain('.rpc("complete_canonical_shift"');
    expect(source).not.toMatch(/from\(["']tech_shifts["']\)\.(insert|update|upsert|delete)\b/);
  });
});
