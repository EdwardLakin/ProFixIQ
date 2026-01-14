// features/work-orders/components/WorkOrderInvoicePDF.tsx
"use client";

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;

  // extra fields (from your vehicles table)
  license_plate?: string;
  unit_number?: string;
  mileage?: string;
  color?: string;
  engine_hours?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;

  // extra fields (from your customers table)
  business_name?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

type ShopInfo = {
  // extra fields (from your shops table)
  name?: string;
  phone_number?: string;
  email?: string;
  street?: string;
  city?: string;
  province?: string;
  postal_code?: string;
};

type Props = {
  workOrderId: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  shopInfo?: ShopInfo; // ✅ added so we can put shop details in invoice header
  lines: RepairLine[];
  summary?: string;
  signatureImage?: string;
};

// ✅ NOTE:
// Do NOT Font.register Helvetica with an undefined src.
// React-PDF includes Helvetica by default, so we can just use it safely.

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
    color: "#0a0a0a",
  },
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid",
  },

  // NEW: header rows for shop details
  headerTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  shopBlock: { flexGrow: 1 },
  shopName: { fontSize: 14, fontWeight: 700, color: "#111" },
  shopLine: { fontSize: 9.5, color: "#333", marginTop: 1 },
  invoiceBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 18, fontWeight: 700, color: "#111" },
  invoiceMeta: { marginTop: 2, fontSize: 10, color: "#444" },

  title: { fontSize: 18, fontWeight: 700, textAlign: "center" },
  subtitle: { marginTop: 4, fontSize: 10, textAlign: "center", color: "#444" },

  grid2: { flexDirection: "row", gap: 12, marginTop: 10 },
  box: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 10,
  },
  boxTitle: { fontSize: 10, fontWeight: 700, marginBottom: 6, color: "#111" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 2 },
  label: { fontSize: 10, color: "#333" },
  value: { fontSize: 10, color: "#111", maxWidth: 260 },

  section: { marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  paragraph: { fontSize: 10, color: "#222" },

  lineItem: {
    borderWidth: 1,
    borderColor: "#efefef",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  bullet: { fontSize: 10, marginBottom: 2, color: "#111" },
  subText: { fontSize: 9.5, color: "#333" },

  signatureWrap: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e1e1e1",
    borderTopStyle: "solid",
    paddingTop: 10,
    alignItems: "center",
  },
  signatureLabel: { fontSize: 10, marginBottom: 6, color: "#111", fontWeight: 700 },
  signatureImage: {
    width: 220,
    height: 90,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderStyle: "solid",
    borderRadius: 6,
    objectFit: "contain",
  },

  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 18,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
    borderTopStyle: "solid",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 9, color: "#666" },
});

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(" ");
}

function compactCsv(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0)
    .join(", ");
}

function fmtVehicle(v?: VehicleInfo): string {
  const year = safeStr(v?.year).trim();
  const make = safeStr(v?.make).trim();
  const model = safeStr(v?.model).trim();
  const parts = [year, make, model].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function fmtVin(v?: VehicleInfo): string {
  const vin = safeStr(v?.vin).trim();
  return vin.length > 0 ? vin : "—";
}

function fmtCustomerAddress(c?: CustomerInfo): string {
  const street = safeStr(c?.street).trim();
  const city = safeStr(c?.city).trim();
  const prov = safeStr(c?.province).trim();
  const postal = safeStr(c?.postal_code).trim();

  const line1 = street.length ? street : "";
  const line2 = compactCsv([city || undefined, prov || undefined, postal || undefined]);

  const out = compactJoin([line1 || undefined, line2 || undefined]);
  return out.length ? out : "—";
}

function fmtShopAddress(s?: ShopInfo): string {
  const street = safeStr(s?.street).trim();
  const city = safeStr(s?.city).trim();
  const prov = safeStr(s?.province).trim();
  const postal = safeStr(s?.postal_code).trim();

  const line1 = street.length ? street : "";
  const line2 = compactCsv([city || undefined, prov || undefined, postal || undefined]);

  const out = compactJoin([line1 || undefined, line2 || undefined]);
  return out.length ? out : "—";
}

type RepairLineFields = {
  complaint?: string;
  cause?: string;
  correction?: string;
  labor_time?: string | number;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function getRepairLineField(line: RepairLine, key: keyof RepairLineFields): string {
  const obj = line as unknown;
  if (!isRecord(obj)) return "—";
  const v = obj[key];
  const s = safeStr(v).trim();
  return s.length ? s : "—";
}

export function WorkOrderInvoicePDF({
  workOrderId,
  vehicleInfo,
  customerInfo,
  shopInfo,
  lines,
  summary,
  signatureImage,
}: Props): JSX.Element {
  const customerName = safeStr(customerInfo?.name).trim() || "—";
  const customerPhone = safeStr(customerInfo?.phone).trim() || "—";
  const customerEmail = safeStr(customerInfo?.email).trim() || "—";
  const customerBusiness = safeStr(customerInfo?.business_name).trim() || "—";
  const customerAddress = fmtCustomerAddress(customerInfo);

  const shopName = safeStr(shopInfo?.name).trim() || "ProFixIQ";
  const shopPhone = safeStr(shopInfo?.phone_number).trim();
  const shopEmail = safeStr(shopInfo?.email).trim();
  const shopAddress = fmtShopAddress(shopInfo);

  const plate = safeStr(vehicleInfo?.license_plate).trim() || "—";
  const unit = safeStr(vehicleInfo?.unit_number).trim() || "—";
  const mileage = safeStr(vehicleInfo?.mileage).trim() || "—";
  const color = safeStr(vehicleInfo?.color).trim() || "—";
  const engineHours = safeStr(vehicleInfo?.engine_hours).trim() || "—";

  const sig =
    typeof signatureImage === "string" && signatureImage.trim().length > 0
      ? signatureImage.trim()
      : null;

  const generatedOn = new Date().toLocaleDateString();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* ✅ Shop header + invoice meta */}
          <View style={styles.headerTop}>
            <View style={styles.shopBlock}>
              <Text style={styles.shopName}>{shopName}</Text>
              <Text style={styles.shopLine}>{shopAddress}</Text>
              {shopPhone.length || shopEmail.length ? (
                <Text style={styles.shopLine}>
                  {compactCsv([shopPhone || undefined, shopEmail || undefined])}
                </Text>
              ) : null}
            </View>

            <View style={styles.invoiceBlock}>
              <Text style={styles.invoiceTitle}>Invoice</Text>
              <Text style={styles.invoiceMeta}>Work Order #{workOrderId}</Text>
              <Text style={styles.invoiceMeta}>Generated {generatedOn}</Text>
            </View>
          </View>

          <View style={styles.grid2}>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Customer</Text>

              <View style={styles.row}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value}>{customerName}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Business</Text>
                <Text style={styles.value}>{customerBusiness}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{customerPhone}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{customerEmail}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Address</Text>
                <Text style={styles.value}>{customerAddress}</Text>
              </View>
            </View>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Vehicle</Text>

              <View style={styles.row}>
                <Text style={styles.label}>Vehicle</Text>
                <Text style={styles.value}>{fmtVehicle(vehicleInfo)}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>VIN</Text>
                <Text style={styles.value}>{fmtVin(vehicleInfo)}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Plate</Text>
                <Text style={styles.value}>{plate}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Unit #</Text>
                <Text style={styles.value}>{unit}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Mileage</Text>
                <Text style={styles.value}>{mileage}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Color</Text>
                <Text style={styles.value}>{color}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Engine Hours</Text>
                <Text style={styles.value}>{engineHours}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Repair Summary</Text>
          <Text style={styles.paragraph}>
            {typeof summary === "string" && summary.trim().length > 0 ? summary.trim() : "—"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Performed</Text>

          {(lines ?? []).length === 0 ? (
            <Text style={styles.paragraph}>—</Text>
          ) : (
            (lines ?? []).map((line, idx) => {
              const complaint = getRepairLineField(line, "complaint");
              const cause = getRepairLineField(line, "cause");
              const correction = getRepairLineField(line, "correction");
              const laborTime = getRepairLineField(line, "labor_time");

              return (
                <View key={`line-${idx}`} style={styles.lineItem}>
                  <Text style={styles.bullet}>• Complaint: {complaint}</Text>
                  <Text style={styles.subText}>Cause: {cause}</Text>
                  <Text style={styles.subText}>Correction: {correction}</Text>
                  <Text style={styles.subText}>Labor Time: {laborTime} hrs</Text>
                </View>
              );
            })
          )}
        </View>

        {sig ? (
          <View style={styles.signatureWrap}>
            <Text style={styles.signatureLabel}>Customer Signature</Text>
            <Image src={sig} style={styles.signatureImage} />
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{shopName}</Text>
          <Text style={styles.footerText}>Work Order #{workOrderId}</Text>
        </View>
      </Page>
    </Document>
  );
}