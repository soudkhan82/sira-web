import { supabase } from "@/lib/supabase";

export async function uploadIncidentPhotos(incidentId: string, files: File[]) {
  const urls: string[] = [];
  for (const [index, file] of files.slice(0, 2).entries()) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${incidentId}/${Date.now()}-${index}.${ext}`;
    const { error } = await supabase.storage.from("incident-photos").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from("incident-photos").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

export function storagePathFromIncidentPhoto(url: string) {
  const marker = "/storage/v1/object/public/incident-photos/";
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}
