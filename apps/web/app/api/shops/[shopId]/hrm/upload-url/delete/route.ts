import { NextRequest, NextResponse } from 'next/server';
import { requireHrmAccess, HrmAccessError } from '@/lib/server/hrm/access';
import { handleApiError } from '../../../../_helpers';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

function errorResponse(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return handleApiError(error, 'DELETE hrm upload url');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.employee.manage');

    const body = await req.json();
    const { key } = body;

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing object key' }, { status: 400 });
    }

    if (!key.startsWith(`hrm/${shopId}/`)) {
      return NextResponse.json({ error: 'Invalid object key for this shop' }, { status: 403 });
    }

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL || !process.env.R2_ACCOUNT_ID) {
      return NextResponse.json({ error: 'Cấu hình Cloudflare R2 chưa đầy đủ trên server' }, { status: 500 });
    }

    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);

    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
