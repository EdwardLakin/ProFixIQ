import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;

  const isPublic =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname === '/reset-password' ||
    pathname === '/favicon.ico' ||
    pathname === '/';

  if (!session && !isPublic) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    return NextResponse.redirect(signInUrl);
  }

  if (!session || isPublic) {
    return res;
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, role, shop_name')
    .eq('id', session.user.id)
    .single();

  const hasPlan = !!profile?.plan;
  const hasProfile = !!profile?.role && !!profile?.shop_name;

  // If no plan, force to plan selection
  if (!hasPlan && !pathname.startsWith('/onboarding/plan')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/onboarding/plan';
    return NextResponse.redirect(redirectUrl);
  }

  // If plan exists but profile incomplete, go to profile setup
  if (hasPlan && !hasProfile && !pathname.startsWith('/onboarding/profile')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/onboarding/profile';
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ['/app/:path*', '/onboarding/:path*'],
};