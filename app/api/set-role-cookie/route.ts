// /app/api/set-role-cookie/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { role } = await req.json();

  if (!role) {
    return NextResponse.json({ error: 'Role is required' }, { status: 400 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set('role', role, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false,
    sameSite: 'lax',
  });

  return res;
}