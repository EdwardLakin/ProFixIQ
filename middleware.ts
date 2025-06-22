import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // User is not signed in
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const plan = profile.plan;

  // Route-based access control
  const restrictedProRoutes = ['/work-orders', '/inspections'];
  const restrictedEliteRoutes = ['/quote', '/settings/shop'];

  // DIY users blocked from Pro+ features
  if (plan === 'diy' && restrictedProRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.redirect(new URL('/upgrade', req.url));
  }

  // Pro users blocked from Elite features
  if (plan === 'pro' && restrictedEliteRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.redirect(new URL('/upgrade', req.url));
  }

  return res;
}