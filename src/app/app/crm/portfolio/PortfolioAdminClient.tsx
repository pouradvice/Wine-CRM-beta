'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function PortfolioAdminClient() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/crm/tasting-requests');
  }, [router]);

  return null;
}
