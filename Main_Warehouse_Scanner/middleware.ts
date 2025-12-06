import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const lockedPath = '/transfer-portal';
  if (request.nextUrl.pathname.startsWith(lockedPath) && request.nextUrl.pathname !== lockedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = lockedPath;
    redirectUrl.search = '';
    redirectUrl.hash = '';
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/transfer-portal/:path*'],
};
