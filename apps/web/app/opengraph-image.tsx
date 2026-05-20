import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export const alt = 'ONI.vn – Nền tảng quản lý bán hàng SaaS đa chi nhánh';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Load local logo and convert to base64 Data URL for Satori
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

export default async function Image() {
  const logoData = getLogoBase64();

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
          backgroundColor: '#070a13',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          padding: '60px 80px',
        }}
      >
        {/* Background glow circle */}
        <div
          style={{
            position: 'absolute',
            width: '800px',
            height: '800px',
            borderRadius: '400px',
            background: 'radial-gradient(circle, rgba(250, 89, 8, 0.12) 0%, rgba(250, 89, 8, 0) 70%)',
            top: '-80px',
            left: '200px',
            display: 'flex',
          }}
        />

        {/* Decorative Grid Lines */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
            background: `
              linear-gradient(to right, #ffffff 1px, transparent 1px),
              linear-gradient(to bottom, #ffffff 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            display: 'flex',
          }}
        />

        {/* Outer subtle frame */}
        <div
          style={{
            position: 'absolute',
            top: '30px',
            left: '30px',
            right: '30px',
            bottom: '30px',
            border: '1px solid rgba(250, 89, 8, 0.15)',
            borderRadius: '24px',
            pointerEvents: 'none',
            display: 'flex',
          }}
        />

        {/* Header: Logo and Brand Name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
            zIndex: 10,
          }}
        >
          {logoData ? (
            <img
              src={logoData}
              alt="ONI Logo"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                marginRight: '16px',
                boxShadow: '0 0 20px rgba(250, 89, 8, 0.4)',
              }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                backgroundColor: '#fa5908',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold',
                marginRight: '16px',
              }}
            >
              O
            </div>
          )}
          <span
            style={{
              fontSize: '44px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-1px',
            }}
          >
            ONI<span style={{ color: '#fa5908' }}>.vn</span>
          </span>
        </div>

        {/* Main Pitch */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            maxWidth: '900px',
            marginBottom: '50px',
            zIndex: 10,
          }}
        >
          <h1
            style={{
              fontSize: '48px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.25,
              margin: '0 0 16px 0',
              letterSpacing: '-0.5px',
            }}
          >
            Nền tảng quản lý bán hàng SaaS đa chi nhánh
          </h1>
          <p
            style={{
              fontSize: '22px',
              fontWeight: 400,
              color: '#94a3b8',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Hệ thống POS & quản lý kho thế hệ mới. Dữ liệu thuộc về bạn — BYOD (Bring Your Own Database). AI, Zalo, Telegram tích hợp sẵn.
          </p>
        </div>

        {/* Features / Badges Row */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            zIndex: 10,
          }}
        >
          {[
            { text: '💾 Bring Your Own Database', bg: 'rgba(250, 89, 8, 0.08)', border: 'rgba(250, 89, 8, 0.25)', color: '#fdba74' },
            { text: '🏢 Quản lý đa chi nhánh', bg: 'rgba(255, 255, 255, 0.04)', border: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0' },
            { text: '🤖 AI, Zalo & Telegram Ready', bg: 'rgba(255, 255, 255, 0.04)', border: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0' },
          ].map((badge, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: '9999px',
                backgroundColor: badge.bg,
                border: `1px solid ${badge.border}`,
                color: badge.color,
                fontSize: '15px',
                fontWeight: 600,
                letterSpacing: '0.2px',
              }}
            >
              {badge.text}
            </div>
          ))}
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
