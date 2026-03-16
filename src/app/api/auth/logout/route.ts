// This API route is no longer used and can be deleted.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ message: 'This logout route is deprecated.' }, { status: 404 });
}
