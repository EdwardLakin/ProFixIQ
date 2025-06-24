import React from 'react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { InspectionSummaryItem } from './summary';

const styles = StyleSheet.create({
  page: { padding: 30 },
  header: { fontSize: 18, marginBottom: 10, fontWeight: 'bold' },
  item: { fontSize: 12, marginBottom: 6 },
});

export async function generateInspectionPDF(summary: InspectionSummaryItem[]): Promise<Uint8Array> {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.header }, 'Maintenance Inspection Summary'),
      ...summary.map((item, index) =>
        React.createElement(
          View,
          { key: index },
          React.createElement(
            Text,
            { style: styles.item },
            `${item.section} - ${item.item}: ${item.status}` +
              (item.note ? ` | Note: ${item.note}` : '')
          )
        )
      )
    )
  );

  const pdfBuffer = await (pdf() as any).updateContainer(doc).toBuffer();
  return pdfBuffer;
}