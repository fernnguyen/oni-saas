import { redirect } from 'next/navigation';

export default function SuperRoot() {
  redirect('/super/dashboard');
}
