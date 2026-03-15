// src/app/api/buyers/route.ts
// Redirects legacy /api/buyers calls to /api/contacts.
// RecapForm has been updated to call /api/contacts directly.
// This redirect keeps any cached / external calls working.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Map old ?clientId= param to new ?accountId=
  const clientId = url.searchParams.get('clientId');
  if (clientId) {
    url.searchParams.delete('clientId');
    url.searchParams.set('accountId', clientId);
  }
  url.pathname = '/api/contacts';
  return NextResponse.redirect(url);
}
