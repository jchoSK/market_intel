// This API route is no longer used and can be deleted.
// Password verification is now handled by /api/verify-password
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ message: 'This login route is deprecated.' }, { status: 404 });
}
