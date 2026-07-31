import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

/**
 * /hrm root → redirect to /hrm/dashboard
 *
 * IMPORTANT: The app uses subdomain routing — the browser URL is:
 *   https://[slug].oni.vn/[branch]/hrm/...
 *
 * The middleware rewrites it internally to /t/[slug]/[branch]/... for
 * Next.js routing, but redirect() must use the public-facing path
 * (without /t/[slug]) to avoid being blocked by the middleware guard
 * that prevents direct access to /t/ from the main domain.
 */
export default async function HrmRootPage({ params }: Props) {
  const { branch } = await params;
  redirect(`/${branch}/hrm/attendance`);
}
