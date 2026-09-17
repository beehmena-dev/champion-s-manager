import { nationalityFlagCode } from "@/lib/nationality-flag";

// SVG real via flag-icons (MIT) em vez de emoji — regional indicator symbol
// não renderiza de forma confiável no Windows (navegador nem app desktop
// empacotado/WebView2, confirmado 15/09/2026).
export function NationalityFlag({
  nationality,
  className = "",
}: {
  nationality: string | null | undefined;
  className?: string;
}) {
  const code = nationalityFlagCode(nationality);
  if (!code) return null;
  return <span className={`fi fi-${code} ${className}`} aria-hidden="true" />;
}
