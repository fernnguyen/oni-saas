import { NextRequest, NextResponse } from 'next/server';

// OAuth callback is no longer used — ONI switched to Service Account flow.
// This stub keeps the route alive so old bookmarks / cached redirects don't 404.
export function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/dashboard/connectors?error=oauth_deprecated`);
}
