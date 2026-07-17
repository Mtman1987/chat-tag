import { NextResponse } from 'next/server';

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('session', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
