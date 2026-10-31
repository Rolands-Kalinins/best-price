import { createClient } from "@/lib/supabase/server";

// Миниатюра фото акции из буклета (grocery.leaflet_thumbs), см. siteOffers в core. Читает участник по RLS; вход проверяет proxy.
// Кэш в браузере сутки, не «навсегда»: ключ акции не меняется при перечитывании страницы, а миниатюра может.
export async function GET(_req: Request, { params }: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await params;
  if (!/^\d+$/.test(source) || !/^[0-9a-f]+$/.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.schema("grocery").from("leaflet_thumbs").select("photo").eq("source_id", Number(source)).eq("external_id", id).maybeSingle();
  if (!data) return new Response(null, { status: 404 });
  // PostgREST отдаёт bytea как hex со «\x» в начале.
  return new Response(Buffer.from(data.photo.slice(2), "hex"), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" } });
}
