import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
  throw new Error('Missing env.VITE_SUPABASE_URL');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

