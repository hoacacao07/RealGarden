/**
 * Photo storage (server only). Uploads to the Supabase Storage bucket `checkins` with the service role key,
 * which never reaches the browser. Without Supabase credentials (local demo) the photo is stored inline as a
 * small JPEG data URL so the check-in still saves and renders (see README, Demo shortcuts).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "checkins";
let client: SupabaseClient | null | undefined;

function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

/** Store a JPEG and return a URL the browser can load. `thumb` is used when Supabase is not configured. */
export async function storePhoto(key: string, jpeg: Buffer, thumb: Buffer): Promise<{ url: string; stored: "supabase" | "inline" }> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb.storage.from(BUCKET).upload(key, jpeg, { contentType: "image/jpeg", upsert: false });
    if (!error) return { url: sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl, stored: "supabase" };
    console.warn("[storage] Supabase upload failed, storing inline thumbnail:", error.message);
  }
  return { url: `data:image/jpeg;base64,${thumb.toString("base64")}`, stored: "inline" };
}
