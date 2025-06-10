import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer'
import { RepairLine } from '../lib/parseRepairOutput'

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 12,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  line: {
    marginBottom: 8,
  },
  label: {
    fontWeight: 'bold',
  },
})

type Props = {
  vehicleId: string
  workOrderId: string
  lines: RepairLine[]
  summary?: string
  vehicleInfo?: {
    year?: string
    make?: string
    model?: string
    vin?: string
  }
  customerInfo?: {
    name?: string
    phone?: string
    email?: string
  }
}

export function WorkOrderPDFDoc({
  vehicleId,
  workOrderId,
  lines,
  summary,
  vehicleInfo,
  customerInfo,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Branded header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold' }}>ProFixIQ Repair Report</Text>
        </View>

        {/* Vehicle + Customer Info */}
        <View style={styles.section}>
          <Text style={styles.title}>Work Order #{workOrderId}</Text>
          <Text>Vehicle ID: {vehicleId}</Text>
          {vehicleInfo && (
            <>
              <Text>
                Vehicle: {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
              </Text>
              <Text>VIN: {vehicleInfo.vin}</Text>
            </>
          )}
          {customerInfo && (
            <>
              <Text>Customer: {customerInfo.name}</Text>
              <Text>Phone: {customerInfo.phone}</Text>
              <Text>Email: {customerInfo.email}</Text>
            </>
          )}
        </View>

        {/* Correction Summary */}
        {summary && (
          <View style={styles.section}>
            <Text style={styles.label}>Correction Summary:</Text>
            <Text>{summary}</Text>
          </View>
        )}

        {/* Work Order Lines */}
        <View style={styles.section}>
          <Text style={styles.title}>Repair Lines</Text>
          {lines.map((line, i) => (
            <View key={i} style={styles.line}>
              <Text>
                <Text style={styles.label}>Complaint:</Text> {line.complaint}
              </Text>
              <Text>
                <Text style={styles.label}>Cause:</Text> {line.cause}
              </Text>
              <Text>
                <Text style={styles.label}>Correction:</Text> {line.correction}
              </Text>
              <Text>
                <Text style={styles.label}>Labor Time:</Text> {line.labor_time || '—'}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}

export function WorkOrderPDFDownloadButton(props: Props) {
  return (
    <PDFDownloadLink
      document={<WorkOrderPDFDoc {...props} />}
      fileName={`WorkOrder_${props.workOrderId}.pdf`}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      {({ loading }) => (loading ? 'Generating PDF...' : 'Download PDF')}
    </PDFDownloadLink>
  )
}