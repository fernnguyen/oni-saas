import { ImageResponse } from 'next/og';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

interface IndustryTheme {
  label: string;
  icon: string;
  accent: string;
  glow1: string; // Top-right gradient color
  glow2: string; // Bottom-left gradient color
  borderColor: string;
  badgeBg: string;
}

const INDUSTRY_THEMES: Record<string, IndustryTheme> = {
  fnb: {
    label: 'F&B / Cà phê & Nhà hàng',
    icon: '☕',
    accent: '#fa5908', // ONI Orange/Coral
    glow1: 'rgba(250, 89, 8, 0.22)',
    glow2: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(250, 89, 8, 0.35)',
    badgeBg: 'rgba(250, 89, 8, 0.1)',
  },
  retail: {
    label: 'Bán lẻ / Cửa hàng',
    icon: '🛍️',
    accent: '#0284c7', // Sky Blue
    glow1: 'rgba(2, 132, 199, 0.22)',
    glow2: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(2, 132, 199, 0.35)',
    badgeBg: 'rgba(2, 132, 199, 0.1)',
  },
  billiards: {
    label: 'Giải trí / CLB Billiards',
    icon: '🎱',
    accent: '#059669', // Emerald
    glow1: 'rgba(5, 150, 105, 0.22)',
    glow2: 'rgba(52, 211, 153, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.35)',
    badgeBg: 'rgba(5, 150, 105, 0.1)',
  },
  sports_court: {
    label: 'Thể thao / Sân bóng & Cầu lông',
    icon: '🏆',
    accent: '#10b981', // Mint
    glow1: 'rgba(16, 185, 129, 0.22)',
    glow2: 'rgba(110, 231, 183, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    badgeBg: 'rgba(16, 185, 129, 0.1)',
  },
  lodging: {
    label: 'Lưu trú / Khách sạn & Homestay',
    icon: '🏨',
    accent: '#0d9488', // Teal
    glow1: 'rgba(13, 148, 136, 0.22)',
    glow2: 'rgba(45, 212, 191, 0.08)',
    borderColor: 'rgba(13, 148, 136, 0.35)',
    badgeBg: 'rgba(13, 148, 136, 0.1)',
  },
  fashion: {
    label: 'Thời trang / Quần áo & Phụ kiện',
    icon: '👚',
    accent: '#db2777', // Pink/Rose
    glow1: 'rgba(219, 39, 119, 0.22)',
    glow2: 'rgba(244, 114, 182, 0.08)',
    borderColor: 'rgba(219, 39, 119, 0.35)',
    badgeBg: 'rgba(219, 39, 119, 0.1)',
  },
  service_hourly: {
    label: 'Dịch vụ / Cho thuê theo giờ',
    icon: '⏱️',
    accent: '#4f46e5', // Indigo
    glow1: 'rgba(79, 70, 229, 0.22)',
    glow2: 'rgba(129, 140, 248, 0.08)',
    borderColor: 'rgba(79, 70, 229, 0.35)',
    badgeBg: 'rgba(79, 70, 229, 0.1)',
  },
};

/**
 * Robust path resolver for Next.js in pnpm monorepo context.
 * Checks both the monorepo root and the specific apps/web subdirectory.
 */
function getAssetPath(relativePath: string): string | null {
  const paths = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), 'apps/web', relativePath),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function getMimeType(buffer: Buffer): string {
  if (buffer.length > 4) {
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // WebP: RIFF .... WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'image/webp';
    }
  }
  return 'image/png'; // default fallback
}

function getLogoBase64() {
  try {
    const logoPath = getAssetPath('public/logo.png');
    if (logoPath) {
      const buffer = fs.readFileSync(logoPath);
      const mime = getMimeType(buffer);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Error reading logo.png:', e);
  }
  return null;
}

function getBackgroundBase64() {
  try {
    const bgPath = getAssetPath('public/tenant_bg.png');
    if (bgPath) {
      const buffer = fs.readFileSync(bgPath);
      const mime = getMimeType(buffer);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Error reading tenant_bg.png:', e);
  }
  return null;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;

  let tenantName = 'Cửa hàng đối tác';
  let industryCode = 'retail';

  // 1. Fetch tenant info with error handling to avoid 500 crashes
  try {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data: tenant, error } = await admin
        .from('tenants')
        .select('name, industry_type')
        .eq('slug', slug)
        .maybeSingle();

      if (!error && tenant) {
        tenantName = tenant.name || tenantName;
        industryCode = tenant.industry_type || industryCode;
      }
    }
  } catch (e) {
    console.error('Error querying Supabase in OG generator route:', e);
  }

  const theme = INDUSTRY_THEMES[industryCode] || INDUSTRY_THEMES.retail;

  // 2. Resolve and load the high-quality fonts containing full Vietnamese + English support
  const fontPathRegular = getAssetPath('public/fonts/PlusJakartaSans-Regular.ttf');
  const fontPathBold = getAssetPath('public/fonts/PlusJakartaSans-Bold.ttf');

  if (!fontPathRegular || !fontPathBold) {
    throw new Error('Plus Jakarta Sans font files are missing from public/fonts/ directory.');
  }

  const fontDataRegular = fs.readFileSync(fontPathRegular);
  const fontDataBold = fs.readFileSync(fontPathBold);

  const logoData = getLogoBase64();
  const bgData = getBackgroundBase64();

  console.log('====== DEBUG OG IMAGE ======');
  console.log('slug:', slug);
  console.log('cwd:', process.cwd());
  console.log('bgData exists:', !!bgData, bgData ? `length: ${bgData.length}` : 'null');

  // 3. Dynamically calculate font-size for tenant name to keep it on a single line
  const maxFontSize = 64;
  const minFontSize = 44;
  let fontSize = maxFontSize;

  if (tenantName.length > 25) {
    fontSize = minFontSize;
  } else if (tenantName.length > 12) {
    const scale = (tenantName.length - 12) / 13;
    fontSize = Math.round(maxFontSize - scale * (maxFontSize - minFontSize));
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c0b0d',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          position: 'relative',
          padding: '50px 60px',
        }}
      >
        {/* Warm cozy shop background image */}
        {bgData && (
          <img
            src={bgData}
            width={1200}
            height={630}
            alt="Cozy shop background"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
            }}
          />
        )}

        {/* Translucent glass-like dark overlay for readability */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1200px',
            height: '630px',
            backgroundColor: 'rgba(12, 11, 13, 0.83)',
            display: 'flex',
          }}
        />

        {/* Harmonious ambient glow lights */}
        <div
          style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            borderRadius: '300px',
            background: `radial-gradient(circle, ${theme.glow1} 0%, rgba(0,0,0,0) 70%)`,
            top: '-150px',
            right: '-100px',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: '500px',
            height: '500px',
            borderRadius: '250px',
            background: `radial-gradient(circle, ${theme.glow2} 0%, rgba(0,0,0,0) 70%)`,
            bottom: '-150px',
            left: '-100px',
            display: 'flex',
          }}
        />

        {/* Premium Thin Double Border Accent */}
        <div
          style={{
            position: 'absolute',
            top: '25px',
            left: '25px',
            right: '25px',
            bottom: '25px',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            borderRadius: '32px',
            pointerEvents: 'none',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '30px',
            right: '30px',
            bottom: '30px',
            border: `1px solid ${theme.borderColor.replace('0.35', '0.12')}`,
            borderRadius: '28px',
            pointerEvents: 'none',
            display: 'flex',
          }}
        />

        {/* Asymmetric Central Container Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            width: '1080px',
            height: '490px',
            backgroundColor: 'rgba(18, 16, 20, 0.45)',
            borderRadius: '24px',
            border: `1px solid ${theme.borderColor}`,
            padding: '48px 56px',
            boxShadow: '0 30px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* LEFT COLUMN: Shop description, details, and branding */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '680px',
              height: '100%',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Premium Industry Badge Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  backgroundColor: theme.badgeBg,
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: '100px',
                  padding: '8px 18px',
                  marginBottom: '24px',
                }}
              >
                <span style={{ fontSize: '20px', marginRight: '8px', display: 'flex', alignItems: 'center' }}>
                  {theme.icon}
                </span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: theme.accent,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}
                >
                  {theme.label}
                </span>
              </div>

              {/* Large, gorgeous shop name with dynamic scaling */}
              <h1
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight: 800,
                  color: '#ffffff',
                  margin: '0 0 12px 0',
                  lineHeight: 1.15,
                  letterSpacing: '-1.5px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                  width: '100%',
                }}
              >
                {tenantName}
              </h1>

              <p
                style={{
                  fontSize: '18px',
                  color: '#94a3b8',
                  fontWeight: 400,
                  margin: 0,
                  letterSpacing: '-0.2px',
                }}
              >
                Cửa hàng thành viên chính thức trên hệ thống ONI.vn
              </p>
            </div>

            {/* Bottom branding panel with sleek logo and description */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: '28px',
                width: '100%',
              }}
            >
              {logoData ? (
                <img
                  src={logoData}
                  alt="ONI Logo"
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '12px',
                    marginRight: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #fa5908 0%, #d946ef 100%)',
                    marginRight: '16px',
                  }}
                />
              )}

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.5px',
                  }}
                >
                  ONI<span style={{ color: '#fa5908' }}>.vn</span>
                </span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 400,
                    color: '#64748b',
                    marginTop: '1px',
                  }}
                >
                  Nền tảng quản trị doanh nghiệp SME chuyên nghiệp
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Highly stylized brand visual badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '280px',
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* Visual Glass Badge */}
            <div
              style={{
                display: 'flex',
                width: '180px',
                height: '180px',
                borderRadius: '90px',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.01) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: `0 20px 40px rgba(0, 0, 0, 0.4), 0 0 40px ${theme.glow1.replace('0.22', '0.15')}`,
                position: 'relative',
              }}
            >
              {/* Outer light glow ring */}
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '-4px',
                  right: '-4px',
                  bottom: '-4px',
                  borderRadius: '94px',
                  border: `2px solid ${theme.borderColor.replace('0.35', '0.25')}`,
                  display: 'flex',
                }}
              />

              {/* Giant Industry Emoji */}
              <span
                style={{
                  fontSize: '84px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {theme.icon}
              </span>
            </div>
            
            {/* Active Store Indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '24px',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '100px',
                padding: '6px 14px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#10b981',
                  marginRight: '8px',
                  display: 'flex',
                }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#34d399',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Đã xác thực
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Plus Jakarta Sans',
          data: fontDataRegular,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Plus Jakarta Sans',
          data: fontDataBold,
          style: 'normal',
          weight: 700,
        },
      ],
    }
  );
}

