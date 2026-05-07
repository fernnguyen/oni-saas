import { redirect } from 'next/navigation';

// Tenant creation moved to /register (workspace signup flow).
export default function NewTenantPage() {
  redirect('/register');
}
