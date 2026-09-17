type FaceEntity = { id: string; name: string; face_url?: string | null };

// Foto real (face_url, importado via scripts/import-player-faces.mjs) ou, na
// ausência dela, o placeholder genérico do próprio FM real: silhueta plana
// de cabeça+ombros, igual pra todo mundo (sem variar por jogador) — não é
// mais um retrato procedural colorido, decisão do usuário (15/09/2026)
// depois de ver o placeholder de verdade do FM. Cor de kit/nacionalidade
// nunca entra aqui, só nos badges de escudo/bandeira ao lado.
export function PlayerFace({ player, className = "w-8 h-8" }: { player: FaceEntity; className?: string }) {
  if (player.face_url) {
    return (
      <img
        src={player.face_url}
        alt={player.name}
        className={`${className} inline-block rounded-full object-cover align-middle`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} inline-block rounded-full align-middle bg-muted`}
      role="img"
      aria-label={player.name}
    >
      <circle cx="12" cy="9.5" r="4.2" className="fill-muted-foreground/70" />
      <path
        d="M3 22 C3 16.5 7 13.5 12 13.5 C17 13.5 21 16.5 21 22 Z"
        className="fill-muted-foreground/70"
      />
    </svg>
  );
}
