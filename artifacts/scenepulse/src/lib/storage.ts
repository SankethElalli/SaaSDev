import { supabase } from "./supabase";

export type StorageBucket = "Images" | "Videos" | "Profile" | "Tracks";

export async function uploadFile(
  bucket: StorageBucket,
  file: File,
): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured");

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
