import { supabase } from '../integrations/client';
export type PreparedLogo = { blob: Blob; dataUrl: string };
export class LogoError extends Error {
  constructor(public code: 'format' | 'size' | 'decode' | 'storage') {
    super(code);
  }
}
const bucket = 'organization-logos';
const maxInput = 2 * 1024 * 1024;
export function isLocalLogo(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 65536 && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function isStoredLogo(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.webp$/i.test(value)
  );
}
export async function prepareOrganizationLogo(file: File): Promise<PreparedLogo> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new LogoError('format');
  if (!file.size || file.size > maxInput) throw new LogoError('size');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LogoError('decode');
  }
  try {
    const canvas = document.createElement('canvas');
    for (const maxSide of [256, 128, 64]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new LogoError('decode');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
      if (!blob || blob.type !== 'image/webp') throw new LogoError('decode');
      if (blob.size > 48 * 1024) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new LogoError('decode'));
        reader.readAsDataURL(blob);
      });
      if (isLocalLogo(dataUrl)) return { blob, dataUrl };
    }
    throw new LogoError('size');
  } finally {
    bitmap.close();
  }
}
export async function uploadOrganizationLogo(workspaceId: string, prepared: PreparedLogo): Promise<string> {
  const path = `${workspaceId}/${crypto.randomUUID()}.webp`;
  if (!supabase || !isStoredLogo(path) || prepared.blob.type !== 'image/webp' || !isLocalLogo(prepared.dataUrl)) throw new LogoError('storage');
  const { error } = await supabase.storage.from(bucket).upload(path, prepared.blob, { contentType: 'image/webp', upsert: false });
  if (error) throw new LogoError('storage');
  return path;
}
export async function organizationLogoSource(path: string): Promise<string | null> {
  if (isLocalLogo(path)) return path;
  if (!supabase || !isStoredLogo(path)) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path, {}, { cache: 'no-store' });
  return error ? null : URL.createObjectURL(data);
}
