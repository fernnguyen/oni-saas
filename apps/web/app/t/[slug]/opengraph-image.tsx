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
}

const INDUSTRY_THEMES: Record<string, IndustryTheme> = {
  fnb: {
    label: 'F&B / Cà phê & Nhà hàng',
    icon: '☕',
    accent: '#fdba74', // Warm orange/amber
    glow1: 'rgba(250, 89, 8, 0.15)', // Orange
    glow2: 'rgba(253, 186, 116, 0.06)', // Peach
    borderColor: 'rgba(250, 89, 8, 0.28)',
  },
  retail: {
    label: 'Bán lẻ / Cửa hàng',
    icon: '🛍️',
    accent: '#38bdf8', // Cyan/Sky blue
    glow1: 'rgba(2, 104, 255, 0.15)', // Blue
    glow2: 'rgba(56, 189, 248, 0.06)', // Sky
    borderColor: 'rgba(2, 104, 255, 0.28)',
  },
  billiards: {
    label: 'Giải trí / CLB Billiards',
    icon: '🎱',
    accent: '#34d399', // Emerald/Mint
    glow1: 'rgba(16, 185, 129, 0.15)', // Green
    glow2: 'rgba(52, 211, 153, 0.06)', // Emerald
    borderColor: 'rgba(16, 185, 129, 0.28)',
  },
  sports_court: {
    label: 'Thể thao / Sân bóng & Cầu lông',
    icon: '🏆',
    accent: '#a7f3d0', // Light green
    glow1: 'rgba(5, 150, 105, 0.15)', // Deep green
    glow2: 'rgba(167, 243, 208, 0.06)', // Mint
    borderColor: 'rgba(5, 150, 105, 0.28)',
  },
  lodging: {
    label: 'Lưu trú / Khách sạn & Homestay',
    icon: '🏨',
    accent: '#2dd4bf', // Teal
    glow1: 'rgba(13, 148, 136, 0.15)', // Teal dark
    glow2: 'rgba(45, 212, 191, 0.06)', // Teal light
    borderColor: 'rgba(13, 148, 136, 0.28)',
  },
  fashion: {
    label: 'Thời trang / Quần áo & Phụ kiện',
    icon: '👚',
    accent: '#f472b6', // Pink/Rose
    glow1: 'rgba(219, 39, 119, 0.15)', // Pink dark
    glow2: 'rgba(244, 114, 182, 0.06)', // Pink light
    borderColor: 'rgba(219, 39, 119, 0.28)',
  },
  service_hourly: {
    label: 'Dịch vụ / Cho thuê theo giờ',
    icon: '⏱️',
    accent: '#818cf8', // Indigo
    glow1: 'rgba(79, 70, 229, 0.15)', // Indigo dark
    glow2: 'rgba(129, 140, 248, 0.06)', // Indigo light
    borderColor: 'rgba(79, 70, 229, 0.28)',
  },
};

function getLogoBase64() {
  try {
    const logoPath = path.join(process.cwd(), 'public/logo.png');
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
  } catch (e) {
    console.error('Error reading logo.png:', e);
  }
  return null;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();

  // Fetch tenant info
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, industry_type')
    .eq('slug', slug)
    .maybeSingle();

  const tenantName = tenant?.name ?? 'Cửa hàng đối tác';
  const industryCode = tenant?.industry_type ?? 'retail';
  const theme = INDUSTRY_THEMES[industryCode] || INDUSTRY_THEMES.retail;

  // Load Vietnamese-supported Inter fonts from jsdelivr CDN
  const fontDataRegular = await fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-vietnamese-400-normal.woff'
  ).then((res) => {
    if (!res.ok) throw new Error('Failed to fetch regular font');
    return res.arrayBuffer();
  });

  const fontDataBold = await fetch(
    'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-vietnamese-700-normal.woff'
  ).then((res) => {
    if (!res.ok) throw new Error('Failed to fetch bold font');
    return res.arrayBuffer();
  });

  const logoData = getLogoBase64();

  // Dynamically calculate appropriate font size based on name length to ensure single-line rendering
  const maxFontSize = 60;
  const minFontSize = 42;
  let fontSize = maxFontSize;

  if (tenantName.length > 25) {
    fontSize = minFontSize;
  } else if (tenantName.length > 15) {
    // Linear scale between 15 and 25 chars
    const scale = (tenantName.length - 15) / 10;
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
          backgroundColor: '#0a090b',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          padding: '60px 80px',
        }}
      >
        {/* Industry-specific warm ambient glows */}
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            borderRadius: '400px',
            background: `radial-gradient(circle, ${theme.glow1} 0%, rgba(0,0,0,0) 70%)`,
            top: '-200px',
            right: '-200px',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: '700px',
            height: '700px',
            borderRadius: '350px',
            background: `radial-gradient(circle, ${theme.glow2} 0%, rgba(0,0,0,0) 70%)`,
            bottom: '-150px',
            left: '-150px',
            display: 'flex',
          }}
        />

        {/* Decorative thin accent border */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '30px',
            right: '30px',
            bottom: '30px',
            border: `1px solid ${theme.borderColor.replace('0.28', '0.12')}`,
            borderRadius: '28px',
            pointerEvents: 'none',
            display: 'flex',
          }}
        />

        {/* Central Glassmorphic Card - Expanded width (1040px) for maximum single-line space */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '1040px',
            maxWidth: '1040px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '24px',
            border: `1px solid ${theme.borderColor}`,
            padding: '50px 60px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
            zIndex: 10,
          }}
        >
          {/* Tenant Name - single line with dynamic font-size scaling */}
          <h1
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 16px 0',
              lineHeight: 1.2,
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

          {/* Subtitle: Industry-specific Category */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '24px',
              color: theme.accent,
              fontWeight: 600,
              marginBottom: '40px',
            }}
          >
            <span style={{ marginRight: '8px' }}>{theme.icon}</span>
            <span>Ngành nghề: {theme.label}</span>
          </div>

          {/* Elegant minimalist divider line */}
          <div
            style={{
              height: '1px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              width: '100%',
              marginBottom: '35px',
            }}
          />

          {/* ONI Branding (logo and slogan) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            {logoData ? (
              <img
                src={logoData}
                alt="ONI Logo"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  marginRight: '18px',
                  boxShadow: `0 0 15px ${theme.borderColor.replace('0.28', '0.3')}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  backgroundColor: '#fa5908',
                  marginRight: '18px',
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
                  fontSize: '15px',
                  fontWeight: 400,
                  color: '#94a3b8',
                  marginTop: '2px',
                }}
              >
                Nền tảng quản lý bán hàng đa chi nhánh
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
          name: 'Inter',
          data: fontDataRegular,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Inter',
          data: fontDataBold,
          style: 'normal',
          weight: 700,
        },
      ],
    }
  );
}
