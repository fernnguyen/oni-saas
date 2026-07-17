import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSuperAdminUser } from '../../../../../../../../lib/server/auth';
import { resetTenantUserPassword } from '../../../../../../../../lib/server/tenantUsers';

const schema = z.object({
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getSuperAdminUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id, userId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  try {
    await resetTenantUserPassword(userId, id, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu' },
      { status: 500 },
    );
  }
}
