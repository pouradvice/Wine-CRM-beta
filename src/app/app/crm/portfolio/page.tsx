import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  redirect('/app/crm/tasting-requests');
}
