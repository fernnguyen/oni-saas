import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../../_helpers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    await requireShopAccess(shopId, 'products.edit')

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL || !process.env.R2_ACCOUNT_ID) {
      return NextResponse.json({ error: 'Cấu hình Cloudflare R2 chưa đầy đủ trên server' }, { status: 500 })
    }

    const key = `${shopId}/${id}.webp`

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: 'image/webp',
    })

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 })
    
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`

    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (e) {
    return handleApiError(e, 'GET products upload url')
  }
}
