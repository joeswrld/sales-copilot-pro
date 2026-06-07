/**
 * messageAttachments.ts
 * Helpers for uploading message files / voice notes to the team-attachments bucket.
 */
import { supabase } from "@/integrations/supabase/client";

export const ATTACHMENT_BUCKET = "team-attachments";

export interface UploadedFile {
  url: string;
  name: string;
  type: string;
  size: number;
  path: string;
}

export async function uploadMessageFile(
  file: File | Blob,
  userId: string,
  opts?: { folder?: "files" | "voice" | "images"; fileName?: string }
): Promise<UploadedFile> {
  const folder = opts?.folder ?? "files";
  const ext =
    opts?.fileName?.split(".").pop() ||
    (file instanceof File ? file.name.split(".").pop() : "bin") ||
    "bin";
  const baseName =
    opts?.fileName ||
    (file instanceof File ? file.name : `${folder}-${Date.now()}.${ext}`);
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${baseName}`.replace(/\s+/g, "_");

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: (file as File).type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
  return {
    url: pub.publicUrl,
    name: baseName,
    type: (file as File).type || "application/octet-stream",
    size: (file as Blob).size,
    path,
  };
}

export function isImageType(type?: string | null) {
  return !!type && type.startsWith("image/");
}
export function isAudioType(type?: string | null) {
  return !!type && type.startsWith("audio/");
}
export function isVideoType(type?: string | null) {
  return !!type && type.startsWith("video/");
}

export function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
