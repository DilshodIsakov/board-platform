import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  console.error("[Supabase] FATAL: Missing env vars. Check .env and restart dev server.");
  throw new Error("Supabase env vars missing. Check .env and restart dev server.");
}

export const supabaseAnonKey = supabaseKey;
export const supabase = createClient(supabaseUrl, supabaseKey);