import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { seedShopPresets } from '@/lib/server/onboardingPresets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../_helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    
    // Require shop manage or view permissions. We'll check products.view or settings.manage.
    // For seeding presets, settings.manage is appropriate.
    const { shop, connector } = await requireShopAccess(shopId, 'settings.manage');
    
    const industryType = shop.industry_type || 'retail';
    const tenantId = shop.tenant_id;
    
    // Trigger seeding of products, categories, resources, settings
    await seedShopPresets(connector, tenantId, shopId, industryType);
    
    // Invalidate cache tags
    invalidate(shopId, 'products');
    invalidate(shopId, 'categories');
    invalidate(shopId, 'location-resources');
    invalidate(shopId, 'shop-settings'); // in case there is settings cache
    
    return NextResponse.json({ success: true, message: 'Dữ liệu mẫu đã được thiết lập thành công.' });
  } catch (err) {
    return handleApiError(err, 'POST onboarding/seed');
  }
}
