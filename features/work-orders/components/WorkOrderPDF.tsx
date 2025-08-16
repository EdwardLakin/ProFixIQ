import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  vehicleId: string;
  workOrderId: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };
  lines: RepairLine[];
  summary?: string;
};

export function WorkOrderPDF({
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Shop Branding */}
        <View style={styles.header}>
          <Text style={styles.logo}>ProFixIQ</Text>
          <Text style={styles.subtitle}>Mobile Repair & Diagnostics</Text>
          <Text>📞 (555) 123-4567 | ✉ support@profixiq.com</Text>
          <Text style={styles.invoiceTitle}>Work Order #{workOrderId}</Text>
        </View>

        {/* Customer + Vehicle Info */}
        <View style={styles.infoSection}>
          <View>
            <Text style={styles.label}>Customer Info:</Text>
            <Text>{customerInfo?.name}</Text>
            <Text>{customerInfo?.phone}</Text>
            <Text>{customerInfo?.email}</Text>
          </View>

          <View>
            <Text style={styles.label}>Vehicle Info:</Text>
            <Text>
              {vehicleInfo?.year} {vehicleInfo?.make} {vehicleInfo?.model}
            </Text>
            <Text>VIN: {vehicleInfo?.vin}</Text>
          </View>
        </View>

        {/* Repair Lines */}
        <View style={styles.lineTable}>
          {lines.map((line, idx) => (
            <View key={idx} style={styles.lineRow}>
              <Text style={styles.lineLabel}>Complaint:</Text>
              <Text>{line.complaint}</Text>
              <Text style={styles.lineLabel}>Correction:</Text>
              <Text>{line.correction}</Text>
            </View>
          ))}
        </View>

        {/* Repair Summary */}
        {summary && (
          <View style={styles.section}>
            <Text style={styles.label}>Repair Summary:</Text>
            <Text>{summary}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 12 },
  header: {
    textAlign: "center",
    marginBottom: 20,
  },
  logo: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1E40AF",
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  invoiceTitle: {
    fontSize: 14,
    marginTop: 10,
    fontWeight: "bold",
    textDecoration: "underline",
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  label: { fontWeight: "bold", marginTop: 4 },
  section: { marginVertical: 10 },
  lineTable: { marginTop: 10 },
  lineRow: { marginBottom: 8 },
  lineLabel: { fontWeight: "bold" },
});
