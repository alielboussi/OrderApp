import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOWED_PREFIXES = ['/api', '/_next', '/favicon.ico', '/manifest.webmanifest'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAllowed = pathname === '/' || ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isAllowed) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static).*)'],
};
