import { NextResponse } from 'next/server';

// Tenant creation is only allowed via /register (public signup) or /super (superadmin).
// This endpoint is intentionally disabled to prevent in-app tenant proliferation.
export async function POST() {
  return NextResponse.json(
    { message: 'Tenant creation is not available here. Use /register to create a new workspace.' },
    { status: 403 },
  );
}
