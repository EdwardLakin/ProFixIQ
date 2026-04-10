// /features/integrations/imports/runFullImport.ts
import { createHash } from "crypto";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

const SHOP_IMPORT_BUCKET = "shop-imports";

type IntakeRow = DB["public"]["Tables"]["shop_boost_intakes"]["Row"] & {
  customers_file_path?: string | null;
  vehicles_file_path?: string | null;
  parts_file_path?: string | null;
  history_file_path?: string | null;
  staff_file_path?: string | null;
};

type RunArgs = {
  shopId: string;
  intakeId: string;
  /**
   * Safety: staff auth user creation is OFF by default.
   * Only ever allow if both:
   *  - ALLOW_STAFF_AUTOCREATE === "true"
   *  - options.createStaffUsers === true
   */
  options?: {
    createStaffUsers?: boolean;
  };
};

export type ShopBoostImportSummary = {
  customersImported: number;
  vehiclesImported: number;
  workOrdersImported: number;
  workOrderLinesImported: number;
  invoicesImported: number;
  partsImported: number;
};

type CsvRow = Record<string, string>;

function norm(s: string): string {
  return (s ?? "").trim();
}

function lower(s: string): string {
  return norm(s).toLowerCase();
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function addUniqueMatch(map: Map<string, string>, conflicts: Set<string>, key: string, id: string): void {
  if (!key || !id) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, id);
    return;
  }
  if (existing !== id) {
    map.delete(key);
    conflicts.add(key);
  }
}

function normalizeText(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePartToken(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildNormalizedPartKey(args: {
  partNumber: string | null;
  sku: string | null;
  name: string;
  supplier: string | null;
  category: string | null;
}): string {
  const partNo = normalizePartToken(args.partNumber);
  const sku = normalizePartToken(args.sku);
  const fallbackName = normalizeText(args.name);
  const supplier = normalizeText(args.supplier);
  const category = normalizeText(args.category);
  return [partNo || "-", sku || "-", fallbackName || "-", supplier || "-", category || "-"].join("|");
}

function dateOnly(iso: string | null): string {
  if (!iso) return "unknown";
  return iso.slice(0, 10);
}

function sha1(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ✅ ROLE PATCH (only change)
const ROLE_MAP: Record<string, DB["public"]["Enums"]["user_role_enum"]> = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  advisor: "advisor",
  mechanic: "mechanic",
  parts: "parts",
  driver: "driver",
  dispatcher: "dispatcher",
  fleet_manager: "fleet_manager",

  // common aliases
  tech: "mechanic",
  technician: "mechanic",

  // requested mapping
  accounting: "admin",
};

function normRole(raw: string | null | undefined): DB["public"]["Enums"]["user_role_enum"] {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return ROLE_MAP[key] ?? "mechanic";
}

function parseCsv(csv: string): { header: string[]; rows: CsvRow[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);

  if (lines.length < 2) return { header: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];

      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += ch;
    }

    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitLine(lines[i]);
    const rec: CsvRow = {};
    for (let c = 0; c < header.length; c += 1) {
      const key = header[c] || `col_${c + 1}`;
      rec[key] = cols[c] ?? "";
    }
    rows.push(rec);
  }

  return { header, rows };
}

function pick(row: CsvRow, patterns: RegExp[]): string | null {
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = lower(k);
    if (patterns.some((p) => p.test(nk))) {
      const v = norm(row[k] ?? "");
      if (v) return v;
    }
  }
  return null;
}

function parseMoney(v: string | null): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  const cleaned = s.replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return null;

  // 1,234.56 -> 1234.56
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // 6,06 -> 6.06
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v: string | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^0-9\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDateIso(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;

  // try Date parsing
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  // try yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00Z").toISOString();

  return null;
}

async function downloadCsv(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.storage.from(SHOP_IMPORT_BUCKET).download(path);
  if (error || !data) return null;
  return data.text();
}

export async function runShopBoostImport(args: RunArgs): Promise<ShopBoostImportSummary> {
  const { shopId, intakeId } = args;
  const supabase = createAdminSupabase();

  // 🔒 hard safety gate for any future staff autocreate logic (currently NOT used)
  const createStaffUsers =
    process.env.ALLOW_STAFF_AUTOCREATE === "true" && args.options?.createStaffUsers === true;
  void createStaffUsers; // keep lint happy; staff user creation is intentionally NOT done here

  // Load intake
  const { data: intake, error: intakeErr } = await supabase
    .from("shop_boost_intakes")
    .select("*")
    .eq("id", intakeId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (intakeErr || !intake) {
    console.warn("[runShopBoostImport] intake missing", intakeErr);
    return {
      customersImported: 0,
      vehiclesImported: 0,
      workOrdersImported: 0,
      workOrderLinesImported: 0,
      invoicesImported: 0,
      partsImported: 0,
    };
  }

  const intakeRow = intake as IntakeRow;

  const [customersCsv, vehiclesCsv, partsCsv, historyCsv, staffCsv] = await Promise.all([
    downloadCsv(intakeRow.customers_file_path ?? null),
    downloadCsv(intakeRow.vehicles_file_path ?? null),
    downloadCsv(intakeRow.parts_file_path ?? null),
    downloadCsv(intakeRow.history_file_path ?? null),
    downloadCsv(intakeRow.staff_file_path ?? null),
  ]);

  // Build caches (keep light: only key columns)
  const customersByEmail = new Map<string, string>();
  const customersByPhone = new Map<string, string>();
  const uniqueCustomersByEmail = new Map<string, string>();
  const uniqueCustomersByPhone = new Map<string, string>();
  const conflictingCustomerEmails = new Set<string>();
  const conflictingCustomerPhones = new Set<string>();
  const vehiclesByVin = new Map<string, string>();
  const vehiclesByPlate = new Map<string, string>();
  const partsByNumber = new Map<string, string>();
  const partsBySku = new Map<string, string>();
  const partsByNormalizedKey = new Map<string, string>();
  const staffByEmail = new Map<string, string>();
  const staffByName = new Map<string, string>();

  // Existing customers
  {
    const { data } = await supabase
      .from("customers")
      .select("id,email,phone,phone_number,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const email = normalizeEmail(String(rec.email ?? ""));
      const phone = normalizePhone(String(rec.phone ?? rec.phone_number ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) customersByEmail.set(email, id);
      if (phone && id) customersByPhone.set(phone, id);
      addUniqueMatch(uniqueCustomersByEmail, conflictingCustomerEmails, email, id);
      addUniqueMatch(uniqueCustomersByPhone, conflictingCustomerPhones, phone, id);
    }
  }

  // Existing vehicles
  {
    const { data } = await supabase
      .from("vehicles")
      .select("id,vin,license_plate,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const vin = lower(String(rec.vin ?? ""));
      const plate = lower(String(rec.license_plate ?? ""));
      const id = String(rec.id ?? "");
      if (vin && id) vehiclesByVin.set(vin, id);
      if (plate && id) vehiclesByPlate.set(plate, id);
    }
  }

  // Existing profiles (staff)
  {
    const { data } = await supabase
      .from("profiles")
      .select("id,email,full_name,shop_id")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const email = lower(String(rec.email ?? ""));
      const name = lower(String(rec.full_name ?? ""));
      const id = String(rec.id ?? "");
      if (email && id) staffByEmail.set(email, id);
      if (name && id) staffByName.set(name, id);
    }
  }

  // Existing parts
  {
    const { data } = await supabase
      .from("parts")
      .select("id,part_number,sku,name,supplier,category,shop_id,normalized_part_key")
      .eq("shop_id", shopId)
      .limit(5000);

    for (const r of data ?? []) {
      const rec = r as unknown as Record<string, unknown>;
      const partNumber = lower(String(rec.part_number ?? ""));
      const sku = lower(String(rec.sku ?? ""));
      const supplier = String(rec.supplier ?? "");
      const category = String(rec.category ?? "");
      const normalizedPartKeyRaw = String(rec.normalized_part_key ?? "").trim();
      const normalizedPartKey =
        normalizedPartKeyRaw ||
        buildNormalizedPartKey({
          partNumber: String(rec.part_number ?? ""),
          sku: String(rec.sku ?? ""),
          name: String(rec.name ?? ""),
          supplier,
          category,
        });
      const id = String(rec.id ?? "");
      if (partNumber && id) partsByNumber.set(partNumber, id);
      if (sku && id) partsBySku.set(sku, id);
      if (id) partsByNormalizedKey.set(normalizedPartKey, id);
    }
  }

  // 1) Import customers
  if (customersCsv) {
    const { rows } = parseCsv(customersCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      const email = lower(pick(row, [/^email$/, /e-mail/, /customer email/, /mail/]) ?? "");
      const phone = lower(pick(row, [/^phone$/, /phone number/, /mobile/, /cell/]) ?? "");

      const first = pick(row, [/^first/, /first name/]);
      const last = pick(row, [/^last/, /last name/]);
      const name =
        pick(row, [/^name$/, /customer name/]) ??
        [first ?? "", last ?? ""].filter(Boolean).join(" ");

      const business = pick(row, [/business/, /company/, /fleet/]);

      const isFleet = !!business || lower(pick(row, [/is fleet/, /fleet\?/]) ?? "") === "true";

      const external_id = `import:${intakeId}:customers:${sha1(
        `${email}|${phone}|${name}|${business ?? ""}`,
      ).slice(0, 16)}`;

      const existingId =
        (email && customersByEmail.get(email)) || (phone && customersByPhone.get(phone));

      if (existingId) {
        await supabase
          .from("customers")
          .update({
            first_name: first ?? null,
            last_name: last ?? null,
            name: name || null,
            email: email || null,
            phone: phone || null,
            phone_number: phone || null,
            business_name: business ?? null,
            is_fleet: isFleet,
            shop_id: shopId,
            source_intake_id: intakeId,
            external_id,
            updated_at: new Date().toISOString(),
          } as DB["public"]["Tables"]["customers"]["Update"])
          .eq("id", existingId);

        continue;
      }

      const { data: inserted, error } = await supabase
        .from("customers")
        .insert({
          shop_id: shopId,
          first_name: first ?? null,
          last_name: last ?? null,
          name: name || null,
          email: email || null,
          phone: phone || null,
          phone_number: phone || null,
          business_name: business ?? null,
          is_fleet: isFleet,
          source_intake_id: intakeId,
          external_id,
          import_confidence: 0.75,
        } as DB["public"]["Tables"]["customers"]["Insert"])
        .select("id")
        .limit(1);

      if (!error) {
        const id = (inserted ?? [])[0]?.id as string | undefined;
        if (id) {
          if (email) customersByEmail.set(email, id);
          if (phone) customersByPhone.set(phone, id);
        }
      }
    }
  }

  // 2) Import vehicles (link to customer if possible)
  if (vehiclesCsv) {
    const { rows } = parseCsv(vehiclesCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      const vin = lower(pick(row, [/^vin$/, /vehicle vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/, /licence/]) ?? "");
      const unit = pick(row, [/unit/, /unit number/, /truck number/]);
      const year = parseIntSafe(pick(row, [/^year$/, /model year/]));
      const make = pick(row, [/^make$/]);
      const model = pick(row, [/^model$/]);
      const mileage = pick(row, [/mileage/, /odometer/]);
      const engineHours = parseIntSafe(pick(row, [/engine hours/, /hours/]));

      const custEmail = normalizeEmail(pick(row, [/customer email/, /email/]));
      const custPhone = normalizePhone(pick(row, [/customer phone/, /phone/]));
      const customer_id =
        (custEmail && customersByEmail.get(custEmail)) ||
        (custPhone && customersByPhone.get(custPhone)) ||
        null;

      const external_id = `import:${intakeId}:vehicles:${sha1(
        `${vin}|${plate}|${unit ?? ""}|${year ?? ""}`,
      ).slice(0, 16)}`;

      const existingId = (vin && vehiclesByVin.get(vin)) || (plate && vehiclesByPlate.get(plate));

      if (existingId) {
        await supabase
          .from("vehicles")
          .update({
            shop_id: shopId,
            customer_id,
            vin: vin || null,
            license_plate: plate || null,
            unit_number: unit ?? null,
            year: year ?? null,
            make: make ?? null,
            model: model ?? null,
            mileage: mileage ?? null,
            engine_hours: engineHours ?? null,
            source_intake_id: intakeId,
            external_id,
            import_confidence: 0.75,
          } as DB["public"]["Tables"]["vehicles"]["Update"])
          .eq("id", existingId);

        continue;
      }

      const { data: inserted, error } = await supabase
        .from("vehicles")
        .insert({
          shop_id: shopId,
          customer_id,
          vin: vin || null,
          license_plate: plate || null,
          unit_number: unit ?? null,
          year: year ?? null,
          make: make ?? null,
          model: model ?? null,
          mileage: mileage ?? null,
          engine_hours: engineHours ?? null,
          source_intake_id: intakeId,
          external_id,
          import_confidence: 0.75,
        } as DB["public"]["Tables"]["vehicles"]["Insert"])
        .select("id")
        .limit(1);

      if (!error) {
        const id = (inserted ?? [])[0]?.id as string | undefined;
        if (id) {
          if (vin) vehiclesByVin.set(vin, id);
          if (plate) vehiclesByPlate.set(plate, id);
        }
      }
    }
  }

  // 3) Import parts (name required)
  if (partsCsv) {
    const { rows } = parseCsv(partsCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      const partNumber = pick(row, [/part number/, /^pn$/, /p\/n/, /part_no/]);
      const sku = pick(row, [/sku/]);
      const name =
        pick(row, [/^name$/, /part name/, /description/]) ??
        partNumber ??
        sku ??
        `Part ${i + 1}`;

      const cost = parseMoney(pick(row, [/^cost$/, /unit cost/, /buy/]));
      const price = parseMoney(pick(row, [/^price$/, /sell/, /retail/]));
      const supplier = pick(row, [/supplier/, /vendor/]);
      const category = pick(row, [/category/]);
      const normalizedPartKey = buildNormalizedPartKey({
        partNumber,
        sku,
        name,
        supplier,
        category,
      });
      const external_id = `import:${intakeId}:part:${sha1(normalizedPartKey).slice(0, 20)}`;

      const existingId =
        partsByNormalizedKey.get(normalizedPartKey) ||
        (partNumber && partsByNumber.get(lower(partNumber))) ||
        (sku && partsBySku.get(lower(sku)));

      if (existingId) {
        await supabase
          .from("parts")
          .update({
            shop_id: shopId,
            name,
            part_number: partNumber ?? null,
            sku: sku ?? null,
            supplier: supplier ?? null,
            category: category ?? null,
            cost: cost ?? null,
            price: price ?? null,
            default_cost: cost ?? null,
            default_price: price ?? null,
            normalized_part_key: normalizedPartKey,
            source_intake_id: intakeId,
            external_id,
            import_notes: JSON.stringify({
              source: "shop_boost",
              source_intake_id: intakeId,
              normalized_part_key: normalizedPartKey,
            }),
          } as DB["public"]["Tables"]["parts"]["Update"])
          .eq("id", existingId);
        continue;
      }

      const { data: inserted } = await supabase
        .from("parts")
        .insert({
          shop_id: shopId,
          name,
          part_number: partNumber ?? null,
          sku: sku ?? null,
          supplier: supplier ?? null,
          category: category ?? null,
          cost: cost ?? null,
          price: price ?? null,
          default_cost: cost ?? null,
          default_price: price ?? null,
          normalized_part_key: normalizedPartKey,
          source_intake_id: intakeId,
          external_id,
          import_notes: JSON.stringify({
            source: "shop_boost",
            source_intake_id: intakeId,
            normalized_part_key: normalizedPartKey,
          }),
        } as DB["public"]["Tables"]["parts"]["Insert"])
        .select("id")
        .limit(1);

      const id = (inserted ?? [])[0]?.id as string | undefined;
      if (id) {
        if (partNumber) partsByNumber.set(lower(partNumber), id);
        if (sku) partsBySku.set(lower(sku), id);
        partsByNormalizedKey.set(normalizedPartKey, id);
      }
    }
  }

  // 4) Import staff -> staff_invite_suggestions (NO auth creation here)
  if (staffCsv) {
    const { rows } = parseCsv(staffCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      // Handles messy headers because pick() normalizes keys with lower(trim)
      const fullName =
        pick(row, [
          /^full[_\s-]*name$/, // Full_Name, full_name, full-name, full name
          /^name$/,
          /employee name/,
          /staff name/,
        ]) ?? null;

      const emailRaw = pick(row, [/^email$/, /e-mail/, /mail/]);
      const email = emailRaw && emailRaw.includes("@") ? emailRaw.trim() : null;

      // ✅ ROLE PATCH (use schema enum + mapping, including accounting->admin)
      const roleRaw = pick(row, [/^role$/, /position/, /job/, /title/]);
      const role = normRole(roleRaw);

      // Skip totally empty rows
      if (!fullName && !email) continue;

      const notes = pick(row, [/reason/, /note/, /notes/, /comment/]) ?? "Imported from staff CSV";

      // Deterministic-ish external id to prevent duplicates on reruns
      const external_id = `import:${intakeId}:staff:${i + 1}:${sha1(
        `${fullName ?? ""}|${email ?? ""}|${role ?? ""}`,
      ).slice(0, 10)}`;

      const { error: staffInsErr } = await supabase.from("staff_invite_suggestions").upsert(
        {
          shop_id: shopId,
          intake_id: intakeId,
          role,
          full_name: fullName,
          email,
          count_suggested: 1,
          notes,
          external_id,
        } as unknown as DB["public"]["Tables"]["staff_invite_suggestions"]["Insert"],
        {
          onConflict: "shop_id,external_id",
        },
      );

      if (staffInsErr) {
        console.warn("[staff invite suggestions] upsert failed", staffInsErr);
      }
    }
  }

  // 5) Import history → completed work orders + lines (+ invoices if totals exist)
  if (historyCsv) {
    const { rows } = parseCsv(historyCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];

      const ro =
        pick(row, [/^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;

      const dateIso =
        parseDateIso(pick(row, [/date/, /service date/, /closed/, /completed/])) ??
        new Date().toISOString();

      const complaint = pick(row, [/complaint/, /concern/]);
      const cause = pick(row, [/cause/]);
      const correction = pick(row, [/correction/, /work performed/, /description/]);

      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/]));
      const labor = parseMoney(pick(row, [/labor/, /labour/]));
      const parts = parseMoney(pick(row, [/parts/]));

      const vin = lower(pick(row, [/vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/]) ?? "");

      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const customerName = pick(row, [/customer name/, /^name$/]) ?? null;

      const customer_id =
        (customerEmail && customersByEmail.get(customerEmail)) ||
        (customerPhone && customersByPhone.get(customerPhone)) ||
        null;

      const vehicle_id =
        (vin && vehiclesByVin.get(vin)) || (plate && vehiclesByPlate.get(plate)) || null;

      const historyFingerprint = sha1(
        [
          ro ?? "",
          dateOnly(dateIso),
          vehicle_id ?? "",
          vin,
          plate,
          String(total ?? ""),
          normalizeText(correction ?? complaint ?? ""),
        ].join("|"),
      ).slice(0, 20);
      const external_id = `import:${intakeId}:history:${historyFingerprint}`;

      const { data: woByExternal } = await supabase
        .from("work_orders")
        .select("id")
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .maybeSingle<{ id: string }>();

      if (!woByExternal?.id && vehicle_id && customer_id) {
        await supabase
          .from("vehicles")
          .update({ customer_id } as DB["public"]["Tables"]["vehicles"]["Update"])
          .eq("id", vehicle_id)
          .eq("shop_id", shopId)
          .is("customer_id", null);
      }

      const woPayload: DB["public"]["Tables"]["work_orders"]["Insert"] = {
        shop_id: shopId,
        customer_id,
        vehicle_id,
        status: "completed",
        type: "repair",
        custom_id: ro,
        customer_name: customerName,
        labor_total: labor ?? null,
        parts_total: parts ?? null,
        invoice_total: total ?? null,
        created_at: dateIso,
        updated_at: dateIso,
        source_intake_id: intakeId,
        external_id,
        import_confidence: 0.78,
        import_notes: JSON.stringify({
          source: "shop_boost",
          source_intake_id: intakeId,
          history_fingerprint: historyFingerprint,
        }),
      };

      let woInserted: Array<{ id: string }> | null = null;
      let woErr: { message?: string } | null = null;

      if (woByExternal?.id) {
        await supabase
          .from("work_orders")
          .update(woPayload as DB["public"]["Tables"]["work_orders"]["Update"])
          .eq("id", woByExternal.id);
        woInserted = [{ id: woByExternal.id }];
      } else {
        const ins = await supabase.from("work_orders").insert(woPayload).select("id").limit(1);
        woInserted = (ins.data ?? null) as Array<{ id: string }> | null;
        woErr = ins.error;
      }

      if (woErr) {
        if (ro) {
          const { data: existingWo } = await supabase
            .from("work_orders")
            .select("id")
            .eq("shop_id", shopId)
            .eq("custom_id", ro)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string }>();

          if (!existingWo?.id) continue;

          await upsertHistoryLine({
            supabase,
            shopId,
            intakeId,
            workOrderId: existingWo.id,
            rowIndex: i + 1,
            complaint,
            cause,
            correction,
            vehicle_id,
          });

          await upsertInvoiceIfNeeded({
            supabase,
            shopId,
            intakeId,
            workOrderId: existingWo.id,
            customer_id,
            total,
            labor,
            parts,
            issuedAt: dateIso,
          });

          continue;
        }
        continue;
      }

      const workOrderId = (woInserted ?? [])[0]?.id as string | undefined;
      if (!workOrderId) continue;

      await upsertHistoryLine({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        rowIndex: i + 1,
        complaint,
        cause,
        correction,
        vehicle_id,
      });

      await upsertInvoiceIfNeeded({
        supabase,
        shopId,
        intakeId,
        workOrderId,
        customer_id,
        total,
        labor,
        parts,
        issuedAt: dateIso,
      });
    }
  }

  // 6) Post-import linkage pass (safe, idempotent, shop-scoped)
  if (vehiclesCsv) {
    const { rows } = parseCsv(vehiclesCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const email = normalizeEmail(pick(row, [/customer email/, /email/]));
      const phone = normalizePhone(pick(row, [/customer phone/, /phone/]));
      const matchedCustomerId =
        (email && !conflictingCustomerEmails.has(email) && uniqueCustomersByEmail.get(email)) ||
        (phone && !conflictingCustomerPhones.has(phone) && uniqueCustomersByPhone.get(phone)) ||
        null;

      if (!matchedCustomerId) continue;

      const vin = lower(pick(row, [/^vin$/, /vehicle vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/, /licence/]) ?? "");
      const unit = pick(row, [/unit/, /unit number/, /truck number/]);
      const year = parseIntSafe(pick(row, [/^year$/, /model year/]));
      const external_id = `import:${intakeId}:vehicles:${sha1(
        `${vin}|${plate}|${unit ?? ""}|${year ?? ""}`,
      ).slice(0, 16)}`;

      await supabase
        .from("vehicles")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["vehicles"]["Update"])
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .eq("source_intake_id", intakeId)
        .is("customer_id", null);
    }
  }

  if (historyCsv) {
    const { rows } = parseCsv(historyCsv);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const customerEmail = normalizeEmail(pick(row, [/customer email/, /^email$/]));
      const customerPhone = normalizePhone(pick(row, [/customer phone/, /^phone$/]));
      const matchedCustomerId =
        (customerEmail &&
          !conflictingCustomerEmails.has(customerEmail) &&
          uniqueCustomersByEmail.get(customerEmail)) ||
        (customerPhone &&
          !conflictingCustomerPhones.has(customerPhone) &&
          uniqueCustomersByPhone.get(customerPhone)) ||
        null;

      if (!matchedCustomerId) continue;

      const ro =
        pick(row, [/^ro$/, /ro number/, /work order/, /order number/, /invoice number/]) ?? null;
      const dateIso =
        parseDateIso(pick(row, [/date/, /service date/, /closed/, /completed/])) ??
        new Date().toISOString();
      const total = parseMoney(pick(row, [/total/, /grand total/, /invoice total/]));
      const correction = pick(row, [/correction/, /work performed/, /description/]);
      const complaint = pick(row, [/complaint/, /concern/]);
      const vin = lower(pick(row, [/vin/]) ?? "");
      const plate = lower(pick(row, [/plate/, /license/]) ?? "");
      const vehicle_id =
        (vin && vehiclesByVin.get(vin)) || (plate && vehiclesByPlate.get(plate)) || null;
      const historyFingerprint = sha1(
        [
          ro ?? "",
          dateOnly(dateIso),
          vehicle_id ?? "",
          vin,
          plate,
          String(total ?? ""),
          normalizeText(correction ?? complaint ?? ""),
        ].join("|"),
      ).slice(0, 20);
      const external_id = `import:${intakeId}:history:${historyFingerprint}`;

      const { data: workOrder } = await supabase
        .from("work_orders")
        .select("id")
        .eq("shop_id", shopId)
        .eq("external_id", external_id)
        .maybeSingle<{ id: string }>();

      if (!workOrder?.id) continue;

      await supabase
        .from("work_orders")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["work_orders"]["Update"])
        .eq("shop_id", shopId)
        .eq("id", workOrder.id)
        .is("customer_id", null);

      await supabase
        .from("invoices")
        .update({ customer_id: matchedCustomerId } as DB["public"]["Tables"]["invoices"]["Update"])
        .eq("shop_id", shopId)
        .eq("work_order_id", workOrder.id)
        .is("customer_id", null);
    }
  }

  const prevBasics = isRecord((intakeRow as unknown as Record<string, unknown>).intake_basics)
    ? ((intakeRow as unknown as Record<string, unknown>).intake_basics as Record<string, unknown>)
    : {};

  const [customersCount, vehiclesCount, workOrdersCount, workOrderLinesCount, invoicesCount, partsCount] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("work_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .contains("metadata", { source_intake_id: intakeId }),
      supabase
        .from("parts")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("source_intake_id", intakeId),
    ]);

  await supabase
    .from("shop_boost_intakes")
    .update(
      {
        processed_at: new Date().toISOString(),
        intake_basics: {
          ...prevBasics,
          importedAt: new Date().toISOString(),
          importSummary: {
            customersImported: customersCount.count ?? 0,
            vehiclesImported: vehiclesCount.count ?? 0,
            workOrdersImported: workOrdersCount.count ?? 0,
            workOrderLinesImported: workOrderLinesCount.count ?? 0,
            invoicesImported: invoicesCount.count ?? 0,
            partsImported: partsCount.count ?? 0,
          },
        },
      } satisfies DB["public"]["Tables"]["shop_boost_intakes"]["Update"],
    )
    .eq("id", intakeId);

  return {
    customersImported: customersCount.count ?? 0,
    vehiclesImported: vehiclesCount.count ?? 0,
    workOrdersImported: workOrdersCount.count ?? 0,
    workOrderLinesImported: workOrderLinesCount.count ?? 0,
    invoicesImported: invoicesCount.count ?? 0,
    partsImported: partsCount.count ?? 0,
  };
}

async function upsertHistoryLine(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  workOrderId: string;
  rowIndex: number;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  vehicle_id: string | null;
}): Promise<void> {
  const { supabase, shopId, intakeId, workOrderId, rowIndex, complaint, cause, correction, vehicle_id } =
    args;

  const external_id = `import:${intakeId}:wol:${workOrderId}:${rowIndex}`;

  const payload = {
    shop_id: shopId,
    work_order_id: workOrderId,
    vehicle_id,
    complaint: complaint ?? null,
    cause: cause ?? null,
    correction: correction ?? null,
    description: correction ?? complaint ?? "Imported history line",
    status: "completed",
    job_type: "repair",
    line_no: rowIndex,
    source_intake_id: intakeId,
    external_id,
    import_confidence: 0.78,
    import_notes: JSON.stringify({
      source: "shop_boost",
      source_intake_id: intakeId,
      external_id,
    }),
  } as DB["public"]["Tables"]["work_order_lines"]["Insert"];

  const { data: existing } = await supabase
    .from("work_order_lines")
    .select("id")
    .eq("shop_id", shopId)
    .eq("external_id", external_id)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    await supabase
      .from("work_order_lines")
      .update(payload as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", existing.id);
    return;
  }

  await supabase.from("work_order_lines").insert(payload);
}

async function upsertInvoiceIfNeeded(args: {
  supabase: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string;
  workOrderId: string;
  customer_id: string | null;
  total: number | null;
  labor: number | null;
  parts: number | null;
  issuedAt: string | null;
}): Promise<void> {
  const { supabase, shopId, intakeId, workOrderId, customer_id, total, labor, parts, issuedAt } = args;

  const hasMoney = (total ?? 0) > 0 || (labor ?? 0) > 0 || (parts ?? 0) > 0;
  if (!hasMoney) return;

  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .maybeSingle<{ id: string }>();

  if (existing?.id) return;

  await supabase.from("invoices").insert({
    shop_id: shopId,
    work_order_id: workOrderId,
    customer_id,
    status: "paid",
    subtotal: Math.max(0, (labor ?? 0) + (parts ?? 0)),
    labor_cost: labor ?? 0,
    parts_cost: parts ?? 0,
    total: total ?? Math.max(0, (labor ?? 0) + (parts ?? 0)),
    issued_at: issuedAt,
    paid_at: issuedAt,
    invoice_number: `IMP-${workOrderId.slice(0, 8)}`,
    currency: "USD",
    metadata: { imported: true, source_intake_id: intakeId },
  } as DB["public"]["Tables"]["invoices"]["Insert"]);
}
