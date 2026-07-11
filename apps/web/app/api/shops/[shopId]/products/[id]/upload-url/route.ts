import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../../_helpers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getTenantActivePlanDetails } from '@/lib/server/subscriptions'

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
    const admin = getSupabaseAdminClient()

    let user;
    const token = req.nextUrl.searchParams.get('token')
    if (token) {
      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (!authError && authData?.user) {
        user = authData.user
      }
    }

    if (!user) {
      const supabaseClient = await getSupabaseServerClient()
      const { data: { user: sessionUser }, error: sessionError } = await supabaseClient.auth.getUser()
      if (!sessionError && sessionUser) {
        user = sessionUser
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shop } = await requireShopAccess(shopId, 'products.edit')

    // Chặn upload R2 đối với gói Tiên Phong
    const planDetails = await getTenantActivePlanDetails(shop.tenant_id)
    if (planDetails?.planCode === 'plan_mini') {
      return NextResponse.json({ error: 'Gói Tiên phong (miễn phí) không hỗ trợ tải ảnh trực tiếp lên R2. Vui lòng sử dụng URL liên kết ảnh hoặc nâng cấp gói.' }, { status: 403 })
    }

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const admin = getSupabaseAdminClient()

    let user;
    const token = req.nextUrl.searchParams.get('token')
    if (token) {
      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (!authError && authData?.user) {
        user = authData.user
      }
    }

    if (!user) {
      const supabaseClient = await getSupabaseServerClient()
      const { data: { user: sessionUser }, error: sessionError } = await supabaseClient.auth.getUser()
      if (!sessionError && sessionUser) {
        user = sessionUser
      }
    }

    if (!user) {
      return NextResponse.json({ error: 401, message: 'Unauthorized' }, { status: 401 })
    }

    const { shop } = await requireShopAccess(shopId, 'products.edit')

    // Chặn upload R2 đối với gói Tiên Phong
    const planDetails = await getTenantActivePlanDetails(shop.tenant_id)
    if (planDetails?.planCode === 'plan_mini') {
      return NextResponse.json({ error: 1, message: 'Gói Tiên phong (miễn phí) không hỗ trợ tải ảnh trực tiếp.' }, { status: 403 })
    }

    if (!process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL || !process.env.R2_ACCOUNT_ID) {
      return NextResponse.json({ error: 2, message: 'Cấu hình Cloudflare R2 chưa đầy đủ trên server' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 3, message: 'Không tìm thấy file tải lên' }, { status: 400 })
    }

    const fileExtension = file.name.split('.').pop() || 'webp'
    const key = `${shopId}/${id}.${fileExtension}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: file.type || 'image/jpeg',
      Body: buffer,
    })

    await s3Client.send(command)
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`

    return NextResponse.json({
      error: 0,
      message: 'Upload thành công',
      data: {
        url: publicUrl
      }
    })
  } catch (e) {
    console.error('Upload route POST error:', e)
    return NextResponse.json({ error: 500, message: 'Lỗi hệ thống khi tải ảnh lên server.' }, { status: 500 })
  }
}
