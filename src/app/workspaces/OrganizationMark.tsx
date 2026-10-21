import { useEffect, useState } from 'react';
import { KairosMark } from '../design/KairosMark';
import { useAuth } from '../auth/AuthProvider';
import { organizationLogoSource } from './organization-logo';
export function OrganizationMark({ name, logoPath, brand = false }: { name: string; logoPath?: string | null; brand?: boolean }) {
  const { sessionBoundary } = useAuth();
  const [source, setSource] = useState<{ path: string; boundary: string | null; src: string } | null>(null);
  useEffect(() => {
    let alive = true;
    let resource: string | null = null;
    if (!logoPath) return;
    async function load() {
      try {
        const src = await organizationLogoSource(logoPath!);
        if (src) {
          if (alive) {
            resource = src;
            setSource({ path: logoPath!, boundary: sessionBoundary, src });
          } else if (src.startsWith('blob:')) URL.revokeObjectURL(src);
        }
      } catch {
        /* Unavailable or inaccessible logos use the organization's fallback. */
      }
    }
    void load();
    return () => {
      alive = false;
      if (resource?.startsWith('blob:')) URL.revokeObjectURL(resource);
    };
  }, [logoPath, sessionBoundary]);
  if (source && source.path === logoPath && source.boundary === sessionBoundary)
    return <img className="workspace-logo-image" src={source.src} alt="" referrerPolicy="no-referrer" onError={() => setSource(null)} />;
  return brand ? <KairosMark /> : <>{name.slice(0, 1)}</>;
}
