import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Klient se service klíčem – obchází RLS. Používat jen na serveru
 * a jen tam, kde jsme předtím ověřili roli volajícího.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
