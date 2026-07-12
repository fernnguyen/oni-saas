import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = getSupabaseAdminClient();
  const { data: products } = await admin.from('products').select('id, name, category_id, metadata').limit(5);
  const { data: categories } = await admin.from('categories').select('*').limit(5);
  
  return NextResponse.json({
    products: products?.map(p => ({
      name: p.name,
      category_id: p.category_id,
      metadata: p.metadata
    })),
    categories
  });
}
