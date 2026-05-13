import { Suspense } from 'react';
import { SuperSignInForm } from '../components/auth/SuperSignInForm';

export default function SuperLoginPage() {
  return (
    <Suspense>
      <SuperSignInForm />
    </Suspense>
  );
}
