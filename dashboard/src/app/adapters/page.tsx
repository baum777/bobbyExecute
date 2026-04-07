import { redirect } from 'next/navigation';
import { DASHBOARD_LEGACY_REDIRECTS } from '@/lib/dashboard-route-map';

export default function Page() {
  redirect(DASHBOARD_LEGACY_REDIRECTS['/adapters']);
}
