/** Only allow same-origin relative paths for navigation coming from data (e.g. notifications). */
export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link || typeof link !== "string") return null;
  const v = link.trim();
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (/[\u0000-\u001f]/.test(v)) return null;
  if (!/^\/[A-Za-z0-9_\-/.?=&%#]*$/.test(v)) return null;
  return v;
}
