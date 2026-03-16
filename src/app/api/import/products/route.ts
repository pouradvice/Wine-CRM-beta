import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { mapDbError } from '@/types';

interface ImportBody {
  rows: Array<Record<string, unknown>>;
}

interface ImportResponse {
  succeeded: number;
  failed: Array<{ index: number; error: string }>;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Get user's team
  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!memberRow) {
    return NextResponse.json({ error: 'User not in any team' }, { status: 403 });
  }

  const team_id = memberRow.team_id;

  // Use service role for inserts (bypasses RLS completely)
  const sbService = createServiceClient();

  let succeeded = 0;
  let skipped = 0;
  const failed: Array<{ index: number; error: string }> = [];

  for (let idx = 0; idx < body.rows.length; idx++) {
    const row = body.rows[idx];

    try {
      // Validate required fields
      const skuNumber = String(row['sku_number'] || '').trim();
      const wineName = String(row['wine_name'] || '').trim();

      if (!skuNumber) {
        failed.push({
          index: idx,
          error: 'sku_number is required',
        });
        continue;
      }

      if (!wineName) {
        failed.push({
          index: idx,
          error: 'wine_name is required',
        });
        continue;
      }

      // Parse numeric fields
      const btgCost = row['btg_cost']
        ? /^\d+(\.\d+)?$/.test(String(row['btg_cost']))
          ? parseFloat(String(row['btg_cost']))
          : null
        : null;

      const frontlineCost = row['frontline_cost']
        ? /^\d+(\.\d+)?$/.test(String(row['frontline_cost']))
          ? parseFloat(String(row['frontline_cost']))
          : null
        : null;

      // Insert directly with service role (NO RLS)
      const { error } = await sbService
        .from('products')
        .upsert(
          {
            team_id,
            sku_number: skuNumber,
            wine_name: wineName,
            type: row['type'] ? String(row['type']).trim() || null : null,
            varietal: row['varietal'] ? String(row['varietal']).trim() || null : null,
            country: row['country'] ? String(row['country']).trim() || null : null,
            region: row['region'] ? String(row['region']).trim() || null : null,
            appellation: row['appellation'] ? String(row['appellation']).trim() || null : null,
            vintage: row['vintage'] ? String(row['vintage']).trim() || null : null,
            distributor: row['distributor'] ? String(row['distributor']).trim() || null : null,
            btg_cost: btgCost,
            frontline_cost: frontlineCost,
            notes: row['notes'] ? String(row['notes']).trim() || null : null,
            is_active: true,
          },
          { onConflict: 'sku_number,team_id' }
        );

      if (error) {
        failed.push({
          index: idx,
          error: mapDbError(error),
        });
      } else {
        succeeded++;
      }
    } catch (e) {
      failed.push({
        index: idx,
        error: String(e),
      });
    }
  }

  return NextResponse.json(
    {
      succeeded,
      failed,
    },
    { status: 200 }
  );
}
