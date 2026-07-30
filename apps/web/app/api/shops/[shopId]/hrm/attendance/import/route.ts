import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import {
  HrmAttendanceInputError,
  prepareAttendanceUpserts,
} from '@/lib/server/hrm/attendanceDays';
import { attendanceImportSchema } from '@/lib/validators/hrm/attendanceDays';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.attendance.manage');
    const input = attendanceImportSchema.parse(await request.json());
    const rows = await prepareAttendanceUpserts({
      repository: access.repository,
      rows: input.rows,
      actorUserId: access.userId,
      source: 'import',
    });
    if (!input.dry_run) {
      await access.repository.upsertAttendanceDays(rows);
    }
    return NextResponse.json({
      success: true,
      dryRun: input.dry_run,
      validRows: rows.length,
    });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? 'Dữ liệu import không hợp lệ.')
        : error instanceof HrmAccessError
          ? error.message
          : error instanceof HrmAttendanceInputError
            ? error.message
            : 'Không thể kiểm tra dữ liệu import.';
    const details =
      error instanceof ZodError
        ? error.issues.map((issue) => ({
            row:
              issue.path[0] === 'rows' && typeof issue.path[1] === 'number'
                ? issue.path[1] + 1
                : null,
            field: issue.path.slice(2).join('.') || null,
            message: issue.message,
          }))
        : undefined;
    return NextResponse.json(
      {
        error: {
          code:
            error instanceof HrmAccessError
              ? error.code
              : error instanceof HrmAttendanceInputError
                ? error.code
                : 'HRM_ATTENDANCE_IMPORT_FAILED',
          message,
          details,
        },
      },
      {
        status:
          error instanceof HrmAccessError
            ? error.status
            : error instanceof ZodError ||
                error instanceof HrmAttendanceInputError
              ? 400
              : 503,
      },
    );
  }
}
