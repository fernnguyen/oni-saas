import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { createHrmCustomFieldSchema } from '@/lib/validators/hrm/profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function respondError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_VALIDATION_ERROR',
          message: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
        },
      },
      { status: 400 },
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'HRM_CUSTOM_FIELD_EXISTS',
          message: 'Mã field này đã tồn tại trong phạm vi đã chọn.',
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý trường tùy chỉnh.',
      },
    },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    return NextResponse.json({
      data: await access.repository.listCustomFields(),
      canManage: access.permissions.includes('hrm.settings.manage'),
    });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    const input = createHrmCustomFieldSchema.parse(await request.json());
    await access.repository.createCustomField({
      id: `HRMF-${crypto.randomUUID()}`,
      key: input.key,
      label: input.label,
      fieldType: input.field_type,
      options: input.options,
      required: input.required,
      tenantWide: input.tenant_wide,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
