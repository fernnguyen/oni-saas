import { NextResponse } from 'next/server';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const overview = await access.repository.getOverview({
      includePayroll: access.permissions.includes('hrm.payroll.view'),
    });

    return NextResponse.json(
      {
        ready: true,
        overview,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof HrmAccessError) {
      return NextResponse.json(
        {
          ready: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }

    return NextResponse.json(
      {
        ready: false,
        error: {
          code: 'HRM_DATA_PLANE_UNAVAILABLE',
          message: 'Không thể tải tổng quan HRM.',
        },
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
