// app/api/confirm-email/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }

  try {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error || !users) {
      return NextResponse.json({ error: 'Could not fetch users' }, { status: 500 });
    }

    const user = users.users.find((u) => u.email === email);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });

    if (confirmError) {
      return NextResponse.json({ error: 'Failed to confirm email' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}