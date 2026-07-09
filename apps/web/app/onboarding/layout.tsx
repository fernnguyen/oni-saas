import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUserWithTenant } from '../../lib/server/auth';
import { AuthSplitLayout } from '../components/layout/AuthSplitLayout';
import Image from 'next/image';

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionUserWithTenant();
  if (!ctx) redirect('/auth/signin');
  return <>{children}</>;
}
