import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  HrmCustomFieldInUseError,
  HrmCustomFieldNotFoundError,
} from '@oni/adapters';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';
import { updateHrmCustomFieldSchema } from '@/lib/validators/hrm/profile';

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
  if (error instanceof HrmCustomFieldNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  if (error instanceof HrmCustomFieldInUseError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể cập nhật trường tùy chỉnh.',
      },
    },
    { status: 503 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shopId: string; fieldId: string }> },
) {
  try {
    const { shopId, fieldId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    const input = updateHrmCustomFieldSchema.parse(await request.json());
    await access.repository.updateCustomField({
      id: fieldId,
      label: input.label,
      options: input.options,
      groupName: input.group_name,
      newTab: input.new_tab,
      required: input.required,
      active: input.active,
      sortOrder: input.sort_order,
      metadata: input.metadata,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ shopId: string; fieldId: string }> },
) {
  try {
    const { shopId, fieldId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    await access.repository.deleteUnusedCustomField(fieldId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return respondError(error);
  }
}
