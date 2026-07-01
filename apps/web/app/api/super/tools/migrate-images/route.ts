import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '@/lib/server/auth';
import { getConnectorForShop } from '@/lib/server/connectorFactory';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { handleApiError } from '../../../shops/_helpers';

const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(req: NextRequest) {
  try {
    const user = await getSuperAdminUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shopId, tenantId, productIds } = await req.json();

    if (!shopId || !tenantId || !productIds || !Array.isArray(productIds)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL || !process.env.R2_ACCOUNT_ID) {
      return NextResponse.json({ error: 'R2 configuration is incomplete' }, { status: 500 });
    }

    const r2PublicUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
    const connector = await getConnectorForShop(shopId, tenantId);

    // Fetch the specific products to process
    const result = await connector.list('products', {
      filters: { id: productIds as any }, // Connector supports array of IDs for filtering
      limit: productIds.length
    });

    const products = result.data || [];
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const errors: any[] = [];

    // Process products concurrently using Promise.all
    const promises = products.map(async (product: any) => {
      const pId = product.id || product.product_id;
      const currentImageUrl = product.image_url;

      if (!currentImageUrl) {
        skipCount++;
        return;
      }

      // Check if it's already on our CDN
      if (currentImageUrl.startsWith(r2PublicUrl) || currentImageUrl.includes('oni.vn')) {
        skipCount++;
        return;
      }

      try {
        // Fetch image from external URL
        const imageRes = await fetch(currentImageUrl);
        if (!imageRes.ok) {
          throw new Error(`Failed to fetch image: ${imageRes.statusText}`);
        }

        const buffer = await imageRes.arrayBuffer();
        const key = `${shopId}/${pId}.webp`;

        // Upload to S2
        const command = new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          ContentType: imageRes.headers.get('content-type') || 'image/webp',
          Body: Buffer.from(buffer),
        });

        await s3Client.send(command);

        const newUrl = `${r2PublicUrl}/${key}`;

        // Update product in DB
        await connector.update('products', pId, { image_url: newUrl });

        successCount++;
      } catch (err: any) {
        console.error(`Error migrating image for product ${pId}:`, err);
        errors.push({ productId: pId, error: err.message });
        failCount++;
      }
    });

    await Promise.all(promises);

    return NextResponse.json({
      successCount,
      skipCount,
      failCount,
      errors
    });

  } catch (e) {
    return handleApiError(e, 'POST /super/tools/migrate-images');
  }
}

// Endpoint to fetch the list of product IDs that need migration
export async function GET(req: NextRequest) {
  try {
    const user = await getSuperAdminUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get('shopId');
    const tenantId = searchParams.get('tenantId');

    if (!shopId || !tenantId) {
      return NextResponse.json({ error: 'Missing shopId or tenantId' }, { status: 400 });
    }

    const connector = await getConnectorForShop(shopId, tenantId);
    
    // Fetch all products (getting just IDs and image_url if possible, but list might return all fields)
    // Using limit: 50000 to get a large set, assuming less than that per shop
    const result = await connector.list('products', { limit: 50000 });
    const products = result.data || [];

    const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') || '';

    // Filter products that need migration
    const productsToMigrate = products.filter((p: any) => {
      const url = p.image_url;
      if (!url) return false;
      if (url.startsWith(r2PublicUrl) || url.includes('oni.vn')) return false;
      return true;
    });

    const productIds = productsToMigrate.map((p: any) => p.id || p.product_id);

    return NextResponse.json({
      total: products.length,
      needMigrationCount: productIds.length,
      productIds
    });
  } catch (e) {
    return handleApiError(e, 'GET /super/tools/migrate-images');
  }
}
