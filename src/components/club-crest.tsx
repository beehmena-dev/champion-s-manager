import { clubColors, contrastText } from "@/game/club-colors";
import { crestMonogram } from "@/lib/club-crest";

type CrestClub = {
  id: string;
  name: string;
  crest_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
};

// Escudo real (crest_url, importado via scripts/import-club-crests.mjs) ou,
// na ausência dele, um badge procedural (cores do clube + sigla) — nunca fica
// sem nada. Mesmo princípio de fallback determinístico do NationalityFlag.
export function ClubCrest({ club, className = "w-5 h-5" }: { club: CrestClub; className?: string }) {
  if (club.crest_url) {
    return (
      <img
        src={club.crest_url}
        alt={club.name}
        className={`${className} inline-block object-contain align-middle`}
      />
    );
  }

  const { primary, secondary } = clubColors(club);
  const text = contrastText(primary);
  const monogram = crestMonogram(club.name);

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} inline-block align-middle`}
      role="img"
      aria-label={club.name}
    >
      <path
        d="M12 1 L22 4 V11 C22 17 17.5 21.5 12 23 C6.5 21.5 2 17 2 11 V4 Z"
        fill={primary}
        stroke={secondary}
        strokeWidth="1.5"
      />
      <text
        x="12"
        y="13.5"
        textAnchor="middle"
        fontSize={monogram.length > 2 ? "7" : "8.5"}
        fontWeight="700"
        fill={text}
        fontFamily="system-ui, sans-serif"
      >
        {monogram}
      </text>
    </svg>
  );
}
