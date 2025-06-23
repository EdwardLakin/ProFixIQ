import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  try {
    // Ensure session is loaded (even if no user logged in)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const pathname = req.nextUrl.pathname;
    const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/api', '/thank-you', '/reset-password'];

    if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
      return res;
    }

    if (!session) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const plan = profile.plan;

    const restrictedProRoutes = ['/quote', '/inspections'];
    const restrictedEliteRoutes = ['/quote', '/settings/shop'];

    if (plan === 'diy' && restrictedProRoutes.some(path => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL('/upgrade', req.url));
    }

    if (plan === 'pro' && restrictedEliteRoutes.some(path => pathname.startsWith(path))) {
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