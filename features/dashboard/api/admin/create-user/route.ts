import { NextResponse } from "next/server";
// NOTE: placeholder — wire Supabase Admin SDK or Auth API later
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, full_name, role } = body ?? {};
    if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
    // TODO: use Supabase service role to invite/create a user and set initial profile/role
    return NextResponse.json({ ok: true, received: { email, full_name, role } });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
