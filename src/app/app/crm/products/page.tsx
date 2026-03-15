// src/app/app/crm/products/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProducts } from '@/lib/data';
import { ProductsClient } from '@/components/products/ProductsClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: products, count } = await getProducts(sb, { page: 0, pageSize: 50 });

  const teamId = (user.user_metadata?.team_id as string | undefined) ?? user.id;

  return (
    <ProductsClient
      initialProducts={products}
      totalCount={count}
      teamId={teamId}
    />
  );
}
