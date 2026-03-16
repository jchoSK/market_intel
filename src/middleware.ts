import type { NextRequest, NextResponse } from 'next/server';

// This is a no-op middleware function.
// It exists solely to satisfy Next.js's requirement for an exported middleware function
// when a middleware.ts file is present but no actual middleware logic is intended.
// If you are NOT using any Next.js middleware, the best solution is to DELETE this file.
export default function middleware(request: NextRequest): NextResponse | void {
  // Intentionally does nothing.
  return;
}

// This config ensures the no-op middleware above runs on a path
// that is highly unlikely to exist, minimizing any performance impact.
// Again, if no middleware is needed, deleting this file is the preferred solution.
export const config = {
  matcher: ['/api/_this-is-a-dummy-path-for-noop-middleware'],
};
