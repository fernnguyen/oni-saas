import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getConnectorForShop } from '@/lib/server/connectorFactory';
import { checkFeatureAccess } from '@/lib/server/features';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const sp = req.nextUrl.searchParams;
    const session_id = sp.get('session_id');
    const session_token = sp.get('session_token');

    if (!session_id || !session_token) {
      return NextResponse.json(
        { error: 'Yêu cầu session_id và session_token hợp lệ để xem menu.' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    // 1. Verify active table ordering session
    const { data: session, error: sessError } = await admin
      .from('qr_ordering_sessions')
      .select('tenant_id, status, active')
      .eq('id', session_id)
      .eq('branch_id', shopId)
      .eq('session_token', session_token)
      .single();

    if (sessError || !session || session.status !== 'active' || session.active !== 'TRUE') {
      return NextResponse.json(
        { error: 'Phiên gọi món không hợp lệ hoặc đã kết thúc.' },
        { status: 403 }
      );
    }

    const tenantId = session.tenant_id;

    // 2. Check Feature Gate
    const hasAccess = await checkFeatureAccess(tenantId, 'qr_table_ordering');
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: 'feature_locked',
          message: 'Tính năng Gọi món tại bàn chưa được kích hoạt cho chi nhánh này.',
        },
        { status: 403 }
      );
    }

    // 3. Fetch products and categories using the shop's specific connector
    const connector = await getConnectorForShop(shopId, tenantId);

    const [productsRes, categoriesRes] = await Promise.all([
      connector.list('products', { limit: 500, filters: { active: 'TRUE' } }),
      connector.list('categories', { limit: 100 })
    ]);

    // Format units denormalization if available
    const products = productsRes.data;
    if (products.length > 0) {
      const unitsResult = await connector.list('product-units', { limit: 2000 });
      const unitsByProduct = unitsResult.data.reduce((acc: Record<string, any[]>, unit: any) => {
        acc[unit.product_id] = acc[unit.product_id] || [];
        acc[unit.product_id].push(unit);
        return acc;
      }, {});

      products.forEach((p: any) => {
        const id = p.id || p.product_id;
        p.product_units = unitsByProduct[id] || [];
      });
    }

    return NextResponse.json({
      products,
      categories: categoriesRes.data,
    });
  } catch (e) {
    console.error('[GET qr-products]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
