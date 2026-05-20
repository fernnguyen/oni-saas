export async function verifyTurnstileToken(token?: string, ip?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  
  // If either Turnstile Secret Key or Site Key is not configured, bypass verification
  if (!secretKey || !siteKey) {
    console.warn('Turnstile is not fully configured (missing TURNSTILE_SECRET_KEY or NEXT_PUBLIC_TURNSTILE_SITE_KEY). Bypassing verification.');
    return true;
  }
  
  if (!token) {
    console.error('Turnstile verification failed: No token provided');
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const outcome = await result.json();
    if (outcome.success) {
      return true;
    } else {
      console.error('Turnstile verification failed:', outcome['error-codes']);
      return false;
    }
  } catch (err) {
    console.error('Turnstile request error:', err);
    return false;
  }
}
