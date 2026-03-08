// Thin REST wrapper around the Supabase PostgREST API.
// Used by feature components that prefer direct fetch over the SDK.

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const BASE_HEADERS: HeadersInit = {
  apikey:        SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      ...BASE_HEADERS,
      ...(init.method === "POST" || init.method === "PATCH"
        ? { Prefer: "return=representation" }
        : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

export const dbGet    = <T>(path: string)              => request<T>(path);
export const dbPost   = <T>(path: string, body: object) => request<T>(path, { method: "POST",   body: JSON.stringify(body) });
export const dbPatch  = <T>(path: string, body: object) => request<T>(path, { method: "PATCH",  body: JSON.stringify(body) });
export const dbDelete = <T>(path: string)              => request<T>(path, { method: "DELETE" });
export const dbRpc    = <T>(fn: string, body: object)  =>
  request<T>(`/rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
