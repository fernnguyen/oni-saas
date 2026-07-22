/**
 * Proxy tương thích ngược cho các mobile build cũ.
 * Mọi request tới Zalo phải chạy tại backend Việt Nam vì Zalo chặn profile API
 * từ IP Supabase Edge ngoài Việt Nam.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST' } },
    );
  }

  try {
    const body = await request.json();
    const backendOrigin = Deno.env.get('ZALO_AUTH_BACKEND_ORIGIN') || 'https://oni.vn';
    const backendUrl = new URL('/api/auth/zalo/mobile', backendOrigin);

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[zalo-auth] Backend Việt Nam không khả dụng:', error);
    return Response.json(
      { error: 'Không thể kết nối máy chủ xác thực Zalo tại Việt Nam' },
      { status: 502, headers: CORS_HEADERS },
    );
  }
});
