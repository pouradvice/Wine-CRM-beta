// src/types/database.types.ts
//
// !! THIS FILE IS GENERATED — DO NOT EDIT BY HAND !!
//
// Generate with:
//   supabase gen types typescript --local > src/types/database.types.ts
//
// Requires a running local Supabase instance:
//   supabase start
//
// After generating, update src/lib/data.ts to import Database and use:
//   SupabaseClient<Database>  instead of  SupabaseClient
//
// Example:
//   import type { Database } from '@/types/database.types';
//   import { createClient } from '@supabase/supabase-js';
//   const sb = createClient<Database>(url, key);
//
// This file is a placeholder that satisfies the TypeScript import
// until the real file is generated locally. It exports an empty
// Database type that is compatible with the bare SupabaseClient
// used throughout data.ts.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Stub — replace entirely with supabase gen types output.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Database {
  public: {
    Tables: Record<string, unknown>;
    Views: Record<string, unknown>;
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}
