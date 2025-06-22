import { NextRequest, NextResponse } from "next/server";

// TODO: Replace with Supabase or database insert
async function saveWorkOrder(data: any) {
  console.log("Saving work order:", data);
  return { success: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, appointment } = body;

    if (!items || !items.length || !appointment) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Replace this with real user session (e.g., from Supabase auth)
    const mockUserId = "user_123";

    const saveResult = await saveWorkOrder({
      userId: mockUserId,
      items,
      appointment,
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    return NextResponse.json(saveResult);
  } catch (err) {
    console.error("Work order creation failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}