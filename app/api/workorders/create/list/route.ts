import { NextRequest, NextResponse } from "next/server";

// 🔁 Replace with Supabase or persistent DB call
const mockWorkOrders = [
  {
    id: "wo1",
    userId: "user_123",
    items: [
      { type: "diagnose", description: "Check Engine Light" },
      { type: "inspection", description: "Safety Inspection" },
    ],
    appointment: "2025-06-25 10:00",
    createdAt: "2025-06-20T14:00:00Z",
    status: "pending",
  },
  {
    id: "wo2",
    userId: "user_456",
    items: [
      { type: "maintenance", description: "Oil Change" },
      { type: "inspection", description: "Pre-Purchase Inspection" },
    ],
    appointment: "2025-06-26 09:00",
    createdAt: "2025-06-20T15:00:00Z",
    status: "pending",
  },
];

export async function GET(_req: NextRequest) {
  try {
    // Eventually replace with:
    // const { data } = await supabase.from("work_orders").select("*");

    return NextResponse.json({ orders: mockWorkOrders });
  } catch (err) {
    console.error("Work order list error:", err);
    return NextResponse.json({ error: "Failed to fetch work orders." }, { status: 500 });
  }
}