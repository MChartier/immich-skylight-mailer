import { AlbumResponseDto, AssetResponseDto, downloadAsset, getAllAlbums, getAlbumInfo, init } from "@immich/sdk";

const rawBaseUrl = process.env.IMMICH_BASE_URL!;
const apiKey = process.env.IMMICH_API_KEY!;
const albumName = process.env.IMMICH_ALBUM_NAME!;

// Verify required env vars
if (!rawBaseUrl || !apiKey || !albumName) {
  throw new Error("Missing IMMICH_BASE_URL or IMMICH_API_KEY or IMMICH_ALBUM_NAME");
}

const baseUrl = ensureApiBaseUrl(rawBaseUrl);

init({ baseUrl, apiKey });

export type ImmichAsset = AssetResponseDto;

/**
 * Finds the ID of an album by its name.
 * @param name The name of the album to find.
 * @returns The ID of the album.
 */
export async function findAlbumIdByName(name: string): Promise<string> {
  const normalizedTarget = name.trim();
  const albums = await getAllAlbums({});
  const match = albums.find(a => normalizeAlbumName(a) === normalizedTarget);
  if (!match) throw new Error(`Album "${name}" not found`);
  return match.id;
}

/**
 * Lists all assets in a specific album.
 * @param albumId The ID of the album to list assets from.
 * @returns An array of assets in the album.
 */
export async function listAlbumAssets(albumId: string): Promise<ImmichAsset[]> {
  const album: AlbumResponseDto = await getAlbumInfo({ id: albumId });
  return album.assets ?? [];
}

/**
 * Downloads the original asset file from Immich.
 * @param assetId The ID of the asset to download.
 * @returns The original asset file as a Buffer.
 */
export async function downloadOriginal(assetId: string): Promise<Buffer> {
  const blob = await downloadAsset({ id: assetId });
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Ensures the given URL is a valid API base URL.
 * @param url The base URL of the Immich server, possibly including /api.
 * @returns The normalized API base URL.
 */
function ensureApiBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (/\/api(\/|$)/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api`;
}

/**
 * Normalizes the album name by trimming whitespace.
 * @param album The album to normalize.
 * @returns The normalized album name.
 */
function normalizeAlbumName(album: AlbumResponseDto): string {
  return (album.albumName || "").trim();
}
