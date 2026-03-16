
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs'; // Ensure Node.js runtime for process.env and crypto

const passwordSchema = z.object({
  password: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = passwordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: 'Password is required.' }, { status: 400 });
    }

    const { password } = parseResult.data;
    const appPassword = process.env.APP_ACCESS_PASSWORD;

    if (!appPassword) {
      console.error('APP_ACCESS_PASSWORD environment variable is not set.');
      return NextResponse.json({ success: false, error: 'Server configuration error.' }, { status: 500 });
    }

    if (password === appPassword) {
      // Generate a simple token (UUID)
      const token = crypto.randomUUID();
      return NextResponse.json({ success: true, token: token });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid password.' }, { status: 401 });
    }
  } catch (error) {
    console.error('Error in /api/verify-password:', error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
