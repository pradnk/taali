import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth';

export default async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await isValidSessionToken(token)) {
    return NextResponse.next();
  }

  // An expired session during a batch should surface to the client's fetch as a
  // clean 401, not as a redirect that arrives as unparseable HTML.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Your session has expired. Sign in again in another tab, then retry.' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Certificate pages (/c/*) and the login page stay public on purpose: the
  // whole point is that a certificate link can be forwarded to a family.
  // Everything that spends ElevenLabs credits or writes data lives under
  // /admin or /api/admin and is covered here.
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
