// app/auth/callback/route.ts (GET handler)
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/', requestUrl));
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, phone, shop_id')
      .eq('id', user.id)
      .maybeSingle();

    const needsOnboarding =
      !profile || !profile.role || !profile.full_name || !profile.phone || !profile.shop_id;

    if (needsOnboarding) {
      return NextResponse.redirect(new URL('/onboarding', requestUrl));
    }

    // Role-based dashboard redirect
    const role = profile.role;
    const path =
      role === 'owner' ? '/dashboard/owner' :
      role === 'admin' ? '/dashboard/admin' :
      role === 'manager' ? '/dashboard/manager' :
      role === 'advisor' ? '/dashboard/advisor' :
      role === 'mechanic' ? '/dashboard/tech' :
      '/';

    return NextResponse.redirect(new URL(path, requestUrl));
  }

  return NextResponse.redirect(new URL('/', requestUrl));
}