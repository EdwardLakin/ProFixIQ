import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@custom-types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const PUBLIC_PATHS = [
    '/',
    '/sign-in',
    '/sign-up',
    '/reset-password',
    '/thank-you',
    '/subscribe',
    '/onboarding',
    '/api',
  ];

  const pathname = req.nextUrl.pathname;

  // ✅ Allow access to public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return res;
  }

  try {
    // 🔒 Check user session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.user) {
      console.warn('🔒 No session found – redirecting to /sign-in');
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    // 🔍 Fetch user's plan from profiles table
    const {
      data: profile,
      error,
    } = await supabase
      .from('profiles')
      .select('plan, shop(*)')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      console.error('❌ Failed to fetch profile:', error);
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const plan = profile.plan;

    // 🚫 Restrict access based on plan
    const restrictedProRoutes = ['/quote', '/inspections'];
    const restrictedProPlusRoutes = ['/quote', '/settings/shop'];

    if (plan === 'diy' && restrictedProRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    if (plan === 'pro' && restrictedProPlusRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    // ✅ Allow access if authorized
    return res;
  } catch (err) {
    console.error('❌ Middleware crash:', err);
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|sign-in|sign-up|reset-password|thank-you|api|subscribe|onboarding|.*\\..*).*)',
  ],
};