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

Font.register({
  family: "Helvetica-Bold",
  fonts: [
    {
      // You can swap this for a local font if you prefer
      src: "https://fonts.gstatic.com/s/helveticaneue/v11/q4UO_Hp7rjNMrQkpAgEFqx1GDk.jpg",
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 12,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  header: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontWeight: "bold",
  },
  lineItem: {
    marginBottom: 8,
  },
  signature: {
    marginTop: 32,
    alignItems: "center",
  },
});

type Props = {
  workOrderId: string;
  vehicleInfo?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
  };
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  lines: RepairLine[];
  summary?: string;
  signatureImage?: string;
};

export function WorkOrderInvoicePDF({
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
  signatureImage,
}: Props): JSX.Element {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>Invoice - Work Order #{workOrderId}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Customer Info:</Text>
          <Text>Name: {customerInfo?.name || "N/A"}</Text>
          <Text>Phone: {customerInfo?.phone || "N/A"}</Text>
          <Text>Email: {customerInfo?.email || "N/A"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Vehicle Info:</Text>
          <Text>
            {(vehicleInfo?.year ?? "----") as string} {vehicleInfo?.make ?? ""}{" "}
            {vehicleInfo?.model ?? ""}
          </Text>
          <Text>VIN: {vehicleInfo?.vin || "N/A"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Repair Summary:</Text>
          <Text>{summary || "N/A"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Work Performed:</Text>
          {lines.map((line, idx) => (
            <View key={idx} style={styles.lineItem}>
              <Text>• Complaint: {line.complaint}</Text>
              <Text>  Cause: {line.cause}</Text>
              <Text>  Correction: {line.correction}</Text>
              <Text>  Labor Time: {line.labor_time} hrs</Text>
            </View>
          ))}
        </View>

        {signatureImage && (
          <View style={styles.signature}>
            <Text style={{ fontSize: 12, marginBottom: 4 }}>
              Customer Signature:
            </Text>
            <Image
              src={signatureImage}
              style={{ width: 200, height: 80, border: "1pt solid #ccc" }}
            />
          </View>
        )}
      </Page>
    </Document>
  );
}