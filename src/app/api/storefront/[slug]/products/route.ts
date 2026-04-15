import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { StorefrontProduct, WineType } from '@/types';

interface ProductRow {
  id: string;
  wine_name: string;
  sku_number: string;
  type: WineType | null;
  varietal: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  vintage: string | null;
  frontline_cost: number | null;
  distributor: string | null;
  tech_sheet_url: string | null;
  tasting_notes: string | null;
  description: string | null;
  notes: string | null;
  brand: BrandValue;
  supplier: SupplierValue;
}

type SupplierData = { name: string | null };
type SupplierValue = SupplierData | SupplierData[] | null;
type BrandData = { name: string | null; supplier: SupplierValue };
type BrandValue = BrandData | BrandData[] | null;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sb = createServiceClient();

  const { data: page, error: pageError } = await sb
    .from('portfolio_pages')
    .select('team_id, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (!page || !page.is_active) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim();
  const type = searchParams.get('type')?.trim();

  let query = sb
    .from('products')
    .select(`
      id,
      wine_name,
      sku_number,
      type,
      varietal,
      country,
      region,
      appellation,
      vintage,
      frontline_cost,
      distributor,
      tech_sheet_url,
      tasting_notes,
      description,
      notes,
      brand:brands(name, supplier:suppliers(name)),
      supplier:suppliers(name)
    `)
    .eq('team_id', page.team_id)
    .eq('is_active', true)
    .order('wine_name');

  if (search) {
    query = query.or([
      `wine_name.ilike.%${search}%`,
      `sku_number.ilike.%${search}%`,
      `varietal.ilike.%${search}%`,
      `country.ilike.%${search}%`,
      `region.ilike.%${search}%`,
      `appellation.ilike.%${search}%`,
      `distributor.ilike.%${search}%`,
    ].join(','));
  }

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products: StorefrontProduct[] = ((data ?? []) as unknown as ProductRow[]).map((row) => {
    const brand = Array.isArray(row.brand) ? row.brand[0] : row.brand;
    const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    const nestedSupplier = Array.isArray(brand?.supplier) ? brand?.supplier[0] : brand?.supplier;

    return ({
    id: row.id,
    wine_name: row.wine_name,
    sku_number: row.sku_number,
    type: row.type,
    varietal: row.varietal,
    country: row.country,
    region: row.region,
    appellation: row.appellation,
    vintage: row.vintage,
    frontline_cost: row.frontline_cost,
    distributor: row.distributor,
    tech_sheet_url: row.tech_sheet_url,
    tasting_notes: row.tasting_notes,
    description: row.description,
    notes: row.notes,
    brand_name: brand?.name ?? null,
    supplier_name: supplier?.name ?? nestedSupplier?.name ?? null,
  });
  });

  return NextResponse.json({ products });
}
