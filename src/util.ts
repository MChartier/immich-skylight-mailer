/**
 * Extracts the file extension from a filename.
 * @param name The filename to extract the extension from
 * @returns The file extension, or an empty string if none exists
 */
export function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1) : "";
}

/**
 * Safely extracts the base name from a filename.
 * @param name The filename to extract the base name from
 * @param fallback The fallback base name to use if extraction fails
 * @returns The extracted base name, or the fallback if extraction fails
 */
export function safeBaseName(name?: string, fallback: string = "photo.jpg"): string {
  if (!name) return fallback;
  // keep extension if present; sanitize
  const clean = name.replace(/[^\w.\-]+/g, "_");
  return clean || fallback;
}
