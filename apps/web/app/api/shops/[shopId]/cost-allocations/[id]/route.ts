export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { costAllocationTemplateUpdateSchema } from '@/lib/validators/assets';
import { handleApiError } from '../../../_helpers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    // 1. Verify template exists and belongs to the active branch
    const current = await connector.findById('cost-allocation-templates', id);
    if (!current || current.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy mẫu phân bổ chi phí trong chi nhánh này.' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = costAllocationTemplateUpdateSchema.parse(body);

    // Force strict branch scoping on write
    data.branch_id = shopId;

    const updated = await connector.update('cost-allocation-templates', id, data);

    return NextResponse.json(updated);
  } catch (e) {
    return handleApiError(e, 'PATCH cost allocation template');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    // 1. Verify template exists and belongs to the active branch
    const current = await connector.findById('cost-allocation-templates', id);
    if (!current || current.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy mẫu phân bổ chi phí trong chi nhánh này.' },
        { status: 404 }
      );
    }

    await connector.delete('cost-allocation-templates', id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE cost allocation template');
  }
}
