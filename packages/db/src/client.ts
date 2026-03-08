import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

let _client: TypedSupabaseClient | null = null;

/**
 * Returns a singleton Supabase client.
 * Call this from apps; they supply the URL + key from their own env.
 */
export function getSupabaseClient(
  url: string,
  anonKey: string,
): TypedSupabaseClient {
  if (!_client) {
    _client = createClient<Database>(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

/**
 * Server-side client using the service-role key.
 * NEVER expose this to the browser.
 */
export function getServiceClient(
  url: string,
  serviceKey: string,
): TypedSupabaseClient {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
