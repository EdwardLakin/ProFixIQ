import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.PARTS_LIFECYCLE_TEST_DATABASE_URL;
const hasPsql = spawnSync("bash", ["-lc", "command -v psql"], { encoding: "utf8" }).status === 0;
const describeDb = databaseUrl && hasPsql ? describe : describe.skip;

function psql(sql: string): string {
  const result = spawnSync("psql", [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  if (result.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

const legacyProductionFixture = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
do $$ begin
  if not exists (select 1 from pg_type where typnamespace='public'::regnamespace and typname='stock_move_reason') then
    create type public.stock_move_reason as enum ('receive','adjust','consume','return','transfer_out','transfer_in','wo_allocate','wo_release','seed');
  end if;
end $$;
create table if not exists public.profiles(id uuid primary key default gen_random_uuid(), user_id uuid, shop_id uuid, role text);
create table if not exists public.part_requests(id uuid primary key default gen_random_uuid(), shop_id uuid not null, work_order_id uuid, job_id uuid, requested_by uuid, notes text, status text default 'open', created_at timestamptz default now());
create table if not exists public.parts(id uuid primary key default gen_random_uuid(), shop_id uuid, name text not null, supplier text, part_number text, price numeric(10,2), cost numeric(10,2));
create table if not exists public.stock_locations(id uuid primary key default gen_random_uuid(), shop_id uuid not null, code text not null, name text not null);
create table if not exists public.work_orders(id uuid primary key default gen_random_uuid(), shop_id uuid, status text default 'awaiting');
create table if not exists public.work_order_lines(id uuid primary key default gen_random_uuid(), work_order_id uuid references public.work_orders(id), shop_id uuid, status text default 'awaiting');
create table if not exists public.part_request_items(
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.part_requests(id), shop_id uuid, work_order_id uuid,
  work_order_line_id uuid, part_id uuid, description text not null, vendor text, qty numeric(12,2) default 1 not null,
  qty_requested numeric(12,2) default 1 not null, qty_reserved numeric(12,2) default 0 not null,
  qty_received numeric(12,2) default 0 not null, qty_consumed numeric(12,2) default 0 not null,
  qty_approved numeric(12,2) default 0 not null, qty_picked numeric(12,2) default 0 not null,
  unit_cost numeric(12,2), unit_price numeric(12,2), quoted_price numeric(12,2), location_id uuid, po_id uuid,
  status text default 'requested', updated_at timestamptz default now(), created_at timestamptz default now()
);
create table if not exists public.work_order_parts(id uuid primary key default gen_random_uuid(), work_order_id uuid references public.work_orders(id), part_id uuid references public.parts(id), quantity integer default 1 not null, unit_price numeric(10,2), total_price numeric(10,2), created_at timestamptz default now(), shop_id uuid);
create table if not exists public.work_order_part_allocations(id uuid primary key default gen_random_uuid(), work_order_line_id uuid not null references public.work_order_lines(id), part_id uuid not null references public.parts(id), location_id uuid not null references public.stock_locations(id), qty numeric(12,2) not null, unit_cost numeric(12,2) default 0 not null, stock_move_id uuid);
create table if not exists public.purchase_orders(id uuid primary key default gen_random_uuid(), shop_id uuid not null, supplier_id uuid default gen_random_uuid(), status text default 'draft', created_at timestamptz default now());
create table if not exists public.purchase_order_lines(id uuid primary key default gen_random_uuid(), po_id uuid not null references public.purchase_orders(id), part_id uuid, sku text, description text, qty numeric not null, unit_cost numeric, location_id uuid, received_qty numeric default 0 not null, created_at timestamptz default now());
create table if not exists public.stock_moves(id uuid primary key default gen_random_uuid(), part_id uuid not null references public.parts(id), location_id uuid not null references public.stock_locations(id), qty_change numeric(12,2) not null, reason public.stock_move_reason not null, reference_kind text, reference_id uuid, created_at timestamptz default now(), created_by uuid, shop_id uuid not null);
create table if not exists public.invoices(id uuid primary key default gen_random_uuid(), shop_id uuid not null, work_order_id uuid, status text default 'draft');
`;

describeDb("parts lifecycle database integration", () => {
  it("runs legacy preflight, consolidated migration, and postcheck in order", () => {
    const preflight = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_preflight.sql", "utf8");
    const consolidated = readFileSync("db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql", "utf8");
    const postcheck = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_postcheck.sql", "utf8");
    psql(legacyProductionFixture);
    const preflightOutput = psql(preflight);
    expect(preflightOutput).toContain("not_applicable_pre_migration");
    psql(consolidated);
    const postcheckOutput = psql(postcheck);
    expect(postcheckOutput).toContain("missing_required_columns");
    for (const signature of [
      "public.parts_allocate_request_item(uuid,uuid,numeric,text)",
      "public.parts_release_allocation(uuid,uuid,numeric,text)",
      "public.parts_receive_request_item(uuid,uuid,numeric,uuid,numeric,text)",
      "public.parts_issue_work_order_part(uuid,uuid,numeric,text)",
      "public.parts_return_to_stock(uuid,uuid,numeric,text)",
    ]) {
      expect(psql(`select to_regprocedure('${signature}') is not null;`)).toBe("t");
    }
  });

  it("runs the read-only audit without mutating data", () => {
    const audit = readFileSync("db/sql/2026-07-11_parts_lifecycle_readonly_audit.sql", "utf8");
    const before = psql("select count(*) from public.stock_moves;");
    psql(audit);
    const after = psql("select count(*) from public.stock_moves;");
    expect(after).toBe(before);
  });
});
