import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/supabase";

interface InspectionItem {
  name: string;
  status: string;
  recommend?: string;
  notes?: string;
}

interface InspectionSection {
  items: InspectionItem[];
}

interface InspectionResult {
  result: {
    sections: InspectionSection[];
  };
}

interface JobLine {
  work_order_id: string;
  job_type: string;
  name: string;
  status: string;
  labor_time?: number;
  notes?: string;
  recommendation?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const { inspectionId, workOrderId, vehicleId } = req.body;

    if (!inspectionId || !workOrderId || !vehicleId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create Supabase client bound to this request/response (keeps user session)
    const supabase = createPagesServerClient<Database>({ req, res });

    const inspectionRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/inspections/${inspectionId}`,
    );
    if (!inspectionRes.ok) {
      return res.status(500).json({ error: "Failed to fetch inspection data" });
    }

    const inspection: InspectionResult = await inspectionRes.json();

    const jobsToInsert: JobLine[] = [];

    inspection.result.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.status === "fail" || item.recommend) {
          jobsToInsert.push({
            work_order_id: workOrderId,
            job_type: "inspection-fail",
            name: item.name,
            recommendation: item.recommend || undefined,
            notes: item.notes || undefined,
            status: "not_started",
            labor_time: 0,
          });
        }
      });
    });

    if (jobsToInsert.length === 0) {
      return res
        .status(200)
        .json({ message: "No failed or recommended items found" });
    }

    const { error: insertError } = await supabase
      .from("work_order_lines")
      .insert(jobsToInsert);

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(500).json({ error: "Failed to insert job lines" });
    }

    return res
      .status(200)
      .json({ success: true, inserted: jobsToInsert.length });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}