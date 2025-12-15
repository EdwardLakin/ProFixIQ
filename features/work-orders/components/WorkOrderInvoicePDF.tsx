"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";

import type { RepairLine } from "@ai/lib/parseRepairOutput";

type VehicleInfo = {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
};

type CustomerInfo = {
  name?: string;
  phone?: string;
  email?: string;
};

type Props = {
  workOrderId: string;
  vehicleInfo?: VehicleInfo;
  customerInfo?: CustomerInfo;
  lines: RepairLine[];
  summary?: string;
  signatureImage?: string;
};

// Use built-in fonts reliably (remote font URLs can fail in PDFs).
// We'll rely on default Helvetica and bold weight usage.
Font.register({
  family: "Helvetica",
  fonts: [
    { src: undefined as unknown as string }, // react-pdf requires registration shape; default font still works
  ],
});

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

  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
  },

  subtitle: {
    marginTop: 4,
    fontSize: 10,
    textAlign: "center",
    color: "#444",
  },

  grid2: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },

  box: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 10,
  },

  boxTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 6,
    color: "#111",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },

  label: {
    fontSize: 10,
    color: "#333",
  },

  value: {
    fontSize: 10,
    color: "#111",
    maxWidth: 260,
  },

  section: {
    marginTop: 12,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
  },

  paragraph: {
    fontSize: 10,
    color: "#222",
  },

  lineItem: {
    borderWidth: 1,
    borderColor: "#efefef",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },

  bullet: {
    fontSize: 10,
    marginBottom: 2,
    color: "#111",
  },

  subText: {
    fontSize: 9.5,
    color: "#333",
  },

  signatureWrap: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#e1e1e1",
    borderTopStyle: "solid",
    paddingTop: 10,
    alignItems: "center",
  },

  signatureLabel: {
    fontSize: 10,
    marginBottom: 6,
    color: "#111",
    fontWeight: 700,
  },

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

  footerText: {
    fontSize: 9,
    color: "#666",
  },
});

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
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

export function WorkOrderInvoicePDF({
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
  signatureImage,
}: Props): JSX.Element {
  const customerName = safeStr(customerInfo?.name).trim() || "—";
  const customerPhone = safeStr(customerInfo?.phone).trim() || "—";
  const customerEmail = safeStr(customerInfo?.email).trim() || "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Invoice</Text>
          <Text style={styles.subtitle}>Work Order #{workOrderId}</Text>

          <View style={styles.grid2}>
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Customer</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Name</Text>
                <Text style={styles.value}>{customerName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{customerPhone}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{customerEmail}</Text>
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
            </View>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Repair Summary</Text>
          <Text style={styles.paragraph}>
            {typeof summary === "string" && summary.trim().length > 0
              ? summary.trim()
              : "—"}
          </Text>
        </View>

        {/* Lines */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Work Performed</Text>

          {(lines ?? []).length === 0 ? (
            <Text style={styles.paragraph}>—</Text>
          ) : (
            (lines ?? []).map((line, idx) => {
              const complaint = safeStr(line.complaint).trim() || "—";
              const cause = safeStr(line.cause).trim() || "—";
              const correction = safeStr(line.correction).trim() || "—";
              const laborTime = safeStr(line.labor_time).trim() || "—";

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

        {/* Signature */}
        {typeof signatureImage === "string" &&
          signatureImage.trim().length > 0 && (
            <View style={styles.signatureWrap}>
              <Text style={styles.signatureLabel}>Customer Signature</Text>
              <Image src={signatureImage} style={styles.signatureImage} />
            </View>
          )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>ProFixIQ</Text>
          <Text style={styles.footerText}>
            Generated {new Date().toLocaleDateString()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}