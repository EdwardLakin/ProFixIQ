import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const PUBLIC_PATHS = [
    '/',
    '/sign-in',
    '/sign-up',
    '/thank-you',
    '/reset-password',
    '/onboarding/plan',
    '/onboarding/shop',
    '/api'
  ];

  const pathname = req.nextUrl.pathname;

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return res;
  }

  try {
    const { data: session } = await supabase.auth.getSession();

    if (!session || !session.user) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const userId = session.user.id;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      // Allow access to onboarding if profile doesn't exist yet
      if (pathname.startsWith('/onboarding')) {
        return res;
      }
      return NextResponse.redirect(new URL('/onboarding/plan', req.url));
    }

    const plan = profile.plan;
    const restrictedProRoutes = ['/quote', '/inspections'];
    const restrictedEliteRoutes = ['/quote', '/settings/shop'];

    if (plan === 'diy' && restrictedProRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    if (plan === 'pro' && restrictedEliteRoutes.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    return res;
  } catch (err) {
    console.error('Middleware error:', err);
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};