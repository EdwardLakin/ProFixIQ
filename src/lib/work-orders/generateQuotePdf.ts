import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function generateQuotePDF(jobs: any[], workOrderId: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  let y = height - 50;

  page.drawText(`Quote for Work Order: ${workOrderId}`, {
    x: 50,
    y,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 30;

  jobs.forEach((job, index) => {
    const jobText = `${index + 1}. ${job.complaint || '—'} — ${job.job_type || '—'} — Est. ${job.labor_time ?? '—'} hrs`;
    page.drawText(jobText, {
      x: 50,
      y,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 20;
    if (y < 50) {
      y = height - 50;
      let page = pdfDoc.addPage([600, 800]); // ✅ allows reassignment later
    }
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}