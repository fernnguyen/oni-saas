import { NextRequest, NextResponse } from 'next/server';
import { requireHrmAccess, HrmAccessError } from '@/lib/server/hrm/access';
import { handleApiError } from '../../../_helpers';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  return handleApiError(error, 'GET hrm upload url');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.employee.manage');

    const body = await req.json();
    const { employeeId, filename, contentType } = body;

    if (!employeeId || !filename || !contentType) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL || !process.env.R2_ACCOUNT_ID) {
      return NextResponse.json({ error: 'Cấu hình Cloudflare R2 chưa đầy đủ trên server' }, { status: 500 });
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const timestamp = Date.now();
    const key = `hrm/${shopId}/${employeeId}/${timestamp}-${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (e) {
    return errorResponse(e);
  }
}
