import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult } from "@/game/types";
import { computeBallPosition, computePlayerPositions, currentCaption, TEXTURE_ANIM_WINDOW } from "@/game/live-positions";
import { liveMatchStats } from "@/game/live-stats";
import { contrastText } from "@/game/club-colors";
import { Button } from "@/components/ui/button";
import { HL_SPEED, type HighlightMode } from "@/game/highlights";
import { useHighlightPlayback } from "@/hooks/use-highlight-playback";
import { usePlayerMotion } from "@/hooks/use-player-motion";
import { MatchAudioEngine } from "@/lib/match-audio";
import { Volume2, VolumeX } from "lucide-react";

// -----------------------------------------------------------------------------
// Visualizador 2D da partida — o motor (src/game/simulation.ts) produz
// eventos discretos por minuto, não uma simulação espacial contínua;
// src/game/live-positions.ts calcula, pra qualquer minuto, o ALVO tático de
// cada jogador (função/instrução/bola). O que se renderiza aqui é esse alvo
// perseguido com posição+velocidade reais (src/hooks/use-player-motion.ts,
// 15/09/2026 — "comportamento real do FM Touch"), sem teleporte entre
// frames e sem dois jogadores desenhados no mesmo ponto. A bola "viaja" até
// o gol certo em torno do minuto de cada evento de ataque (chance/gol/
// defesa), com destaque nos jogadores envolvidos em cada evento.
//
// Visual (2026-09-12, 2ª correção): o RETRATO da rodada anterior era
// baseado num vídeo antigo/genérico e acabou vindo de uma tela ERRADA de
// novo (a de análise/tática, não o modo de câmera ao vivo). O user mandou
// um vídeo NOVO, dedicado, mostrando a partida de verdade em 2D Classic —
// e é PAISAGEM, exatamente como a nossa versão original (2026-09-11) já
// tinha: moldura "pílula" roxo-escura (arquibancada) + anel marrom-terracota
// SÓLIDO (não listrado) + grama em círculos concêntricos, fichas numeradas
// NA COR DO CLUBE com o número DENTRO do círculo. A única mudança real que
// a comparação frame-a-frame confirmou: durante o jogo normal NENHUM
// jogador mostra nome flutuando (só nos boletins/telas de análise) — nome
// só faz sentido nos destaques (gol/cartão/lesão), que já tínhamos.
//
// Ritmo (2026-09-12, 3ª rodada — "o motor de jogo está todo quebrado
// visualmente, nada parecido com a realidade"): a causa raiz não era mais o
// visual do campo (já corrigido acima), era o RELÓGIO. O 2D tocava a
// partida INTEIRA (0-90') contínua a 6-15 minutos de jogo por segundo real
// — uma partida cabia em 6 a 30 segundos reais, rápido demais pra qualquer
// passe/movimento ser perceptível como futebol (tudo virava teleporte).
// Trocado pelo MESMO motor de "melhores momentos" que o 3D já usava
// (useHighlightPlayback, ver src/hooks/use-highlight-playback.ts): só os
// lances decisivos (gol/grande chance/expulsão) tocam, num ritmo real de
// jogo, com corte rápido entre eles — igual ao "Key Highlights" do FM real
// (vídeo de referência do user: velocidade "minimamente mais rápida que o
// normal", intervalo entre lances "o mínimo possível").
// -----------------------------------------------------------------------------

const HIGHLIGHT_WINDOW_BEFORE = 1;
const HIGHLIGHT_WINDOW_AFTER = 2.5;
const GOAL_BANNER_WINDOW = 2.6;

const SPEED_OPTIONS = { lento: HL_SPEED * 0.65, normal: HL_SPEED, rapido: HL_SPEED * 1.6 } as const;

// Nome da chave mantido do tempo em que o áudio só existia no visualizador
// 3D (removido) — preservar pra não perder a preferência de quem já tinha
// desativado o som.
const AUDIO_MUTED_LS_KEY = "footymanager-3d-muted";

// Preferência de modo de lances (chave/estendido/completa), lembrada entre partidas.
const MODE_LS_KEY = "footymanager-highlight-mode";

/** Sigla de 3 letras do clube pro placar (CAM, FLA, SAO...). */
function clubAbbrev(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const skip = new Set(["de", "da", "do", "dos", "das", "e", "fc", "ec", "sc", "ac", "cr", "clube", "futebol"]);
  const main = words.filter((w) => !skip.has(w.toLowerCase()));
  const src = main.length ? main : words;
  if (src.length >= 3) return src.slice(0, 3).map((w) => w[0]!.toUpperCase()).join("");
  return (src[0] ?? name).slice(0, 3).toUpperCase();
}

// x/y do nosso modelo (0-100, y=100 é o gol do mandante) → % de tela num
// campo em PAISAGEM (mandante ataca da esquerda pra direita).
function toScreen(x: number, y: number): { left: number; top: number } {
  return { left: 100 - y, top: x };
}

export function MatchPitch({
  result, homeName, awayName, homeColors, awayColors, numbers, stadiumCapacity,
  initialMinute = 0, maxMinute = 90, onReachMax,
}: {
  result: MatchResult; homeName: string; awayName: string;
  homeColors?: { primary: string; secondary: string };
  awayColors?: { primary: string; secondary: string };
  numbers?: Map<string, number | undefined>;
  stadiumCapacity?: number; // alimenta o volume da torcida no áudio (ver MatchAudioEngine)
  initialMinute?: number; // de onde começar (ex: 45, pra retomar o 2º tempo sem reanimar o 1º)
  maxMinute?: number;     // teto de reprodução (ex: 45, pra pausar no intervalo)
  onReachMax?: () => void; // disparado uma vez quando a reprodução alcança maxMinute
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const events = result.events ?? [];
  const homePossessionPct = result.stats?.possession ?? 50;

  const playerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of [...(result.homeLineup ?? []), ...(result.awayLineup ?? [])]) m.set(l.playerId, l.playerName);
    return m;
  }, [result.homeLineup, result.awayLineup]);

  const [speedKey, setSpeedKey] = useState<keyof typeof SPEED_OPTIONS>("normal");
  // Modo de lances (chave / estendido / partida completa), igual ao FM real.
  // Preferência fica salva entre partidas.
  const [mode, setMode] = useState<HighlightMode>(() => {
    try {
      const v = localStorage.getItem(MODE_LS_KEY);
      return v === "extended" || v === "full" ? v : "key";
    } catch { return "key"; }
  });

  const {
    segments, segIndex, minute, effMin, playing, setPlaying, phase, replay,
    skipToNext, rewatch,
  } = useHighlightPlayback({
    events, initialMinute, maxMinute, speed: SPEED_OPTIONS[speedKey], mode, onReachMax,
    resolveScorer: (playerId, fallback) => (playerId && playerNameById.get(playerId)) || fallback,
  });

  // Áudio sintetizado (torcida/apito/gol/substituição) — portado do antigo
  // visualizador 3D (removido), ver src/lib/match-audio.ts. `start()` é
  // chamado de novo (idempotente) nos cliques de Assistir/mudo, gestos reais
  // do usuário — alguns navegadores exigem isso pra liberar áudio.
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(AUDIO_MUTED_LS_KEY) === "1"; } catch { return false; }
  });
  const audioRef = useRef<MatchAudioEngine | null>(null);
  if (!audioRef.current) audioRef.current = new MatchAudioEngine();
  const audioFiredRef = useRef<Set<string>>(new Set());
  const lastReplayGoalRef = useRef<number | null>(null);
  const audioPrevMinRef = useRef(initialMinute);

  useEffect(() => {
    if (!segments.length) return; // "sem lances" — nem liga o áudio
    const engine = audioRef.current!;
    engine.setMuted(muted);
    engine.start();
    engine.whistle(); // apito de início do trecho ao vivo
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { audioRef.current?.setMuted(muted); }, [muted]);
  useEffect(() => {
    audioRef.current?.setCrowdFill(Math.max(0.4, Math.min(1, (stadiumCapacity ?? 30000) / 45000)));
  }, [stadiumCapacity]);

  // Apito (cartão) e sininho (sub) pros eventos cruzados durante um lance —
  // nunca pra eventos "pulados" no corte entre lances (o corte já adianta o
  // relógio pro início do próximo lance antes do salto).
  useEffect(() => {
    if (phase !== "playing" || replay) { audioPrevMinRef.current = minute; return; }
    const from = audioPrevMinRef.current;
    for (const e of events) {
      if (e.minute <= from || e.minute > minute) continue;
      if (e.type !== "yellow" && e.type !== "red" && e.type !== "sub") continue;
      const key = `${e.type}-${e.minute}`;
      if (audioFiredRef.current.has(key)) continue;
      audioFiredRef.current.add(key);
      if (e.type === "sub") audioRef.current?.subChime();
      else audioRef.current?.whistle(e.type === "red");
    }
    audioPrevMinRef.current = minute;
  }, [minute, phase, replay, events]);

  // Estouro de torcida na reprise de gol (uma vez por gol distinto).
  useEffect(() => {
    if (replay && replay.goalMin !== lastReplayGoalRef.current) {
      lastReplayGoalRef.current = replay.goalMin;
      audioRef.current?.setTension(1);
      audioRef.current?.goalBurst();
    }
  }, [replay]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [Math.floor(effMin)]);

  const visibleEvents = useMemo(() => events.filter((e) => e.minute <= effMin), [events, effMin]);

  const { liveHome, liveAway } = useMemo(() => {
    let h = 0, a = 0;
    for (const e of visibleEvents) {
      if (e.type === "goal") { if (e.side === "home") h++; else a++; }
    }
    return { liveHome: h, liveAway: a };
  }, [visibleEvents]);

  const ball = useMemo(
    () => computeBallPosition(
      events, effMin, homePossessionPct,
      result.homeLineup ?? [], result.awayLineup ?? [], result.homeFormation, result.awayFormation,
    ),
    [events, effMin, homePossessionPct, result],
  );

  function highlightFor(playerId: string): "goal" | "yellow" | "red" | "injury" | null {
    for (const e of events) {
      if (e.playerId !== playerId) continue;
      if (effMin < e.minute - HIGHLIGHT_WINDOW_BEFORE || effMin > e.minute + HIGHLIGHT_WINDOW_AFTER) continue;
      if (e.type === "goal") return "goal";
      if (e.type === "yellow") return "yellow";
      if (e.type === "red") return "red";
      if (e.type === "injury") return "injury";
    }
    return null;
  }

  // Anel sutil pros micro-eventos de textura (ver src/game/texture.ts) —
  // sem etiqueta de nome (são frequentes, uma pra cada evento ia poluir a
  // tela); só um "aceso" rápido pra dar a sensação de que aquele jogador tá
  // fazendo alguma coisa AGORA, mesmo fora de um destaque de verdade.
  const texture = result.texture ?? [];
  function textureActiveFor(playerId: string): boolean {
    for (const t of texture) {
      if (t.playerId !== playerId && t.targetId !== playerId) continue;
      if (effMin >= t.minute && effMin - t.minute < TEXTURE_ANIM_WINDOW) return true;
    }
    return false;
  }

  const ratingsById = useMemo(() => new Map((result.ratings ?? []).map((r) => [r.playerId, r])), [result.ratings]);
  const ratedHome = useMemo(() => (result.homeLineup ?? [])
    .filter((l) => ratingsById.has(l.playerId))
    .map((l) => ({ ...ratingsById.get(l.playerId)!, playerName: l.playerName }))
    .sort((a, b) => b.rating - a.rating), [result.homeLineup, ratingsById]);
  const ratedAway = useMemo(() => (result.awayLineup ?? [])
    .filter((l) => ratingsById.has(l.playerId))
    .map((l) => ({ ...ratingsById.get(l.playerId)!, playerName: l.playerName }))
    .sort((a, b) => b.rating - a.rating), [result.awayLineup, ratingsById]);
  const motm = useMemo(() => [...ratedHome, ...ratedAway].sort((a, b) => b.rating - a.rating)[0], [ratedHome, ratedAway]);

  // Alvo tático "onde esse jogador DEVERIA estar agora" — igual sempre foi.
  // O que renderizamos de verdade (`dots`, abaixo) é esse alvo perseguido
  // com posição+velocidade reais (ver src/hooks/use-player-motion.ts) — sem
  // teleporte entre frames, com separação garantida entre jogadores.
  const targetDots = useMemo(() => computePlayerPositions(
    result.homeLineup ?? [], result.awayLineup ?? [],
    result.homeFormation ?? "4-3-3", result.awayFormation ?? "4-3-3",
    effMin, events, homePossessionPct, result.texture ?? [],
  ), [result.homeLineup, result.awayLineup, result.homeFormation, result.awayFormation, effMin, events, homePossessionPct, result.texture]);
  // Reseta (snap direto pro alvo, sem perseguição) exatamente nos pontos de
  // corte reais do sistema: troca de lance e início/fim de reprise de gol.
  const resetKey = `${segIndex}:${replay ? `replay-${replay.goalMin}` : "live"}`;
  const dots = usePlayerMotion(targetDots, resetKey);

  const caption = useMemo(
    () => (phase === "playing" ? currentCaption(events, effMin, homeName, awayName, homePossessionPct) : null),
    [events, effMin, phase, homeName, awayName, homePossessionPct],
  );

  // Gol recém-acontecido (ou reprise em andamento) — banner substitui a
  // legenda de jogada por uns segundos (mesma janela usada pra destacar o
  // autor do gol nas fichas).
  const goalEvtNow = useMemo(
    () => events.find((e) => e.type === "goal" && effMin >= e.minute && effMin <= e.minute + GOAL_BANNER_WINDOW),
    [events, effMin],
  );
  const goalWindow = !!goalEvtNow || !!replay;
  const goalScorerName = replay?.scorer ?? (goalEvtNow?.playerId ? playerNameById.get(goalEvtNow.playerId) : undefined);

  // Tensão da torcida (áudio) — sobe rápido em lance perigoso/gol, desce
  // devagar; só dispara de novo quando o booleano muda (ver setTension).
  const chanceWindow = useMemo(
    () => events.some((e) => e.type === "chance" && effMin >= e.minute - 1 && effMin <= e.minute + 0.3),
    [events, effMin],
  );
  useEffect(() => {
    audioRef.current?.setTension(goalWindow ? 1 : chanceWindow ? 0.4 : 0);
  }, [goalWindow, chanceWindow]);

  const liveStats = useMemo(() => liveMatchStats(result.stats, events, effMin, 90), [result.stats, events, effMin]);

  const HIGHLIGHT_COLOR: Record<string, string> = {
    goal: "#facc15", yellow: "#eab308", red: "#ef4444", injury: "#f97316",
  };

  const homePrimary = homeColors?.primary ?? "#3b82f6";
  const awayPrimary = awayColors?.primary ?? "#e11d48";
  const homeSecondary = homeColors?.secondary ?? "#0f172a";
  const awaySecondary = awayColors?.secondary ?? "#0f172a";

  const isFinal = phase === "done";
  const nextCutClock = phase === "cut" && segments[segIndex + 1] ? `${Math.floor(segments[segIndex + 1].start)}'` : "";
  const lastGoodMin = maxMinute >= 45 && initialMinute >= 45 ? "no 2º tempo" : "até aqui";

  // Nenhum lance decisivo neste período — nem monta o campo, só o aviso +
  // as estatísticas (mesmo padrão do 3D).
  if (phase === "empty") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: homePrimary }} />
            {homeName} {liveHome} × {liveAway} {awayName}
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: awayPrimary }} />
          </span>
        </div>
        <div className="flex h-[min(40vh,320px)] flex-col items-center justify-center gap-3 rounded-md border bg-elevated/20 text-center text-sm text-muted-foreground">
          <span className="text-2xl">😴</span>
          <span>Sem lances de perigo {lastGoodMin}.</span>
          {onReachMax && <Button size="sm" onClick={onReachMax}>Continuar</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Placar estilo transmissão do FM: sigla + cor de cada clube nas
          pontas, gols no centro e cronômetro com o período atual. */}
      <div className="mx-auto flex w-fit items-stretch overflow-hidden rounded-md border text-sm font-semibold shadow-sm">
        <span
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ background: homePrimary, color: contrastText(homePrimary) }}
        >
          <span className="font-mono tracking-wider">{clubAbbrev(homeName)}</span>
          <span className="hidden sm:inline font-normal opacity-90">{homeName}</span>
        </span>
        <span className="flex items-center gap-2 bg-background px-3 py-1.5 font-mono text-base">
          {liveHome} <span className="text-muted-foreground">:</span> {liveAway}
        </span>
        <span
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ background: awayPrimary, color: contrastText(awayPrimary) }}
        >
          <span className="hidden sm:inline font-normal opacity-90">{awayName}</span>
          <span className="font-mono tracking-wider">{clubAbbrev(awayName)}</span>
        </span>
        <span className="flex items-center gap-1.5 border-l bg-elevated/40 px-3 py-1.5 font-mono text-xs">
          {replay ? (
            <span className="text-destructive">REPRISE</span>
          ) : (
            <>
              <span>{Math.min(maxMinute, Math.floor(minute))}'</span>
              <span className="text-muted-foreground">{maxMinute > 45 ? "2ºT" : "1ºT"}</span>
            </>
          )}
        </span>
      </div>

      {/* Moldura estilo FM21 Touch (2D Classic, PAISAGEM — confirmado no
          vídeo dedicado que o user gravou 2026-09-12): "pílula" roxo-escuro
          (arquibancada fora de foco) → anel marrom-terracota SÓLIDO (pista
          de atletismo) → campo com grama cortada em círculos concêntricos.
          Cada camada usa aspect-[105/68] + padding em % (nunca max-h): a
          altura sempre nasce da largura, então nenhuma camada pode ficar
          mais alta que a de fora e vazar por baixo (era o bug antigo do
          botão "Assistir" coberto — ver histórico do roadmap). */}
      <div
        className="w-full max-w-[calc(min(72vh,680px)*1.544)] mx-auto p-2 sm:p-3 shadow-xl relative"
        style={{ background: "radial-gradient(ellipse at 50% 50%, #2c2140, #161020)", borderRadius: "999px / 64px" }}
      >
        <div
          className="relative w-full aspect-[105/68] overflow-hidden p-[2.6%]"
          style={{ background: "#7a4432", borderRadius: "999px / 56px" }}
        >
          <div
            className="relative w-full h-full overflow-hidden border-2"
            style={{
              background: "repeating-radial-gradient(circle at 50% 50%, #1d5a2c 0px, #1d5a2c 22px, #1a5027 22px, #1a5027 44px)",
              borderColor: "rgba(255,255,255,0.2)",
              borderRadius: "999px / 46px",
            }}
          >

          {/* Marcações — em metros de verdade (viewBox 0 0 105 68), então
              círculos/arcos saem redondos de verdade mesmo com o campo
              esticado numa proporção não-quadrada. */}
          <svg viewBox="0 0 105 68" className="absolute inset-0 w-full h-full" style={{ opacity: 0.55 }}>
            <g fill="none" stroke="#ffffff" strokeWidth="0.35">
              <rect x="0.4" y="0.4" width="104.2" height="67.2" />
              <line x1="52.5" y1="0.4" x2="52.5" y2="67.6" />
              <circle cx="52.5" cy="34" r="9.15" />
              {/* área e pequena área do mandante (esquerda) */}
              <rect x="0.4" y="13.84" width="16.1" height="40.32" />
              <rect x="0.4" y="24.84" width="5.5" height="18.32" />
              <path d="M 16.5 25.5 A 9.15 9.15 0 0 1 16.5 42.5" />
              {/* área e pequena área do visitante (direita) */}
              <rect x="88.5" y="13.84" width="16.1" height="40.32" />
              <rect x="99.1" y="24.84" width="5.5" height="18.32" />
              <path d="M 88.5 25.5 A 9.15 9.15 0 0 0 88.5 42.5" />
            </g>
            <circle cx="52.5" cy="34" r="0.45" fill="#ffffff" />
            <circle cx="11" cy="34" r="0.45" fill="#ffffff" />
            <circle cx="94" cy="34" r="0.45" fill="#ffffff" />
          </svg>

          {goalWindow ? (
            <div className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 z-30 animate-bounce rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-1.5 text-center font-black uppercase tracking-wider text-slate-950 shadow-2xl">
              <span className="text-base sm:text-lg">⚽ Golaço!</span>
              {goalScorerName && <div className="text-[10px] font-bold normal-case tracking-normal">{goalScorerName}</div>}
            </div>
          ) : caption && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 max-w-[92%] truncate rounded-full bg-blue-600/90 px-3 py-1 text-center text-[11px] font-medium text-white shadow">
              {caption}
            </div>
          )}

          {dots.map((d) => {
            const hl = highlightFor(d.playerId);
            const isHome = d.side === "home";
            const bg = isHome ? homePrimary : awayPrimary;
            const fg = contrastText(bg);
            const texAtiva = !hl && textureActiveFor(d.playerId);
            const ringColor = hl ? HIGHLIGHT_COLOR[hl] : texAtiva ? "#38bdf8" : isHome ? homeSecondary : awaySecondary;
            const { left, top } = toScreen(d.x, d.y);
            const num = numbers?.get(d.playerId);
            return (
              <div
                key={d.playerId}
                className="absolute z-10 flex flex-col items-center pointer-events-none"
                // 0,12s (não os 0,4s que tinha antes): a posição já chega
                // suavizada de `live-positions.ts` (passe a passe, com ease),
                // então uma transição CSS longa só reencadeava atrás do dado
                // novo a cada frame (~16ms) e deixava o movimento com um
                // rastro de "borrão"/atraso em vez de acompanhar de perto.
                style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -50%)", transition: "left 0.12s linear, top 0.12s linear" }}
              >
                <div
                  className={`flex items-center justify-center rounded-full border-2 font-black shadow-lg ${hl ? "animate-pulse" : ""}`}
                  style={{ width: 24, height: 24, background: bg, color: fg, borderColor: ringColor, fontSize: 10 }}
                >
                  {num ?? ""}
                </div>
                {/* Nome só nos destaques (gol/cartão/lesão) — confirmado no
                    vídeo dedicado que NENHUM jogador mostra nome flutuando
                    durante o jogo normal em 2D Classic, só nas telas de
                    análise/boletim. */}
                {hl && (
                  <span className="mt-0.5 whitespace-nowrap rounded bg-black/75 px-1 text-[8px] font-bold leading-tight text-white shadow">
                    {hl === "goal" ? "⚽ " : hl === "injury" ? "🩹 " : ""}{d.playerName.split(" ").pop()}
                  </span>
                )}
              </div>
            );
          })}

          {(() => {
            const { left, top } = toScreen(ball.x, ball.y);
            return (
              <div
                className="absolute z-20 rounded-full border-2 border-black bg-white shadow-lg"
                style={{
                  left: `${left}%`, top: `${top}%`, width: 9, height: 9,
                  transform: "translate(-50%, -50%)", transition: "left 0.12s linear, top 0.12s linear",
                  boxShadow: "0 0 7px 2px rgba(34,211,238,0.55)",
                }}
              />
            );
          })()}
          </div>
        </div>

        {/* Corte entre lances — mesmo padrão do 3D: intervalo bem curto
            ("tempo de espera mínimo possível", per o vídeo de referência),
            só um flash com o próximo minuto pra deixar claro que pulou. */}
        {phase === "cut" && (
          <div className="absolute inset-0 z-40 flex items-center justify-center rounded-[inherit] bg-slate-950/85 backdrop-blur-sm">
            <span className="font-mono text-sm tracking-wider text-white/70">{nextCutClock}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm" variant="outline"
          onClick={() => { audioRef.current?.start(); if (isFinal) rewatch(); else setPlaying((p) => !p); }}
          disabled={phase === "cut"}
        >
          {isFinal ? "Rever lances" : playing ? "Pausar" : "Assistir"}
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={() => { audioRef.current?.start(); skipToNext(); }}
          disabled={!!replay || phase !== "playing" || segIndex + 1 >= segments.length}
        >
          Próximo lance ⏭
        </Button>
        <Button
          size="sm" variant="ghost" className="px-2"
          onClick={() => {
            audioRef.current?.start();
            setMuted((m) => {
              const next = !m;
              try { localStorage.setItem(AUDIO_MUTED_LS_KEY, next ? "1" : "0"); } catch { /* ignore */ }
              return next;
            });
          }}
          title={muted ? "Ativar som" : "Silenciar"}
        >
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>
        <select
          className="bg-transparent border rounded px-1.5 py-1 text-xs"
          value={mode}
          onChange={(e) => {
            const v = e.target.value as HighlightMode;
            setMode(v);
            try { localStorage.setItem(MODE_LS_KEY, v); } catch { /* sem storage, segue */ }
          }}
          title="Quanto da partida você quer assistir"
        >
          <option value="key">Lances-chave</option>
          <option value="extended">Lances estendidos</option>
          <option value="full">Partida completa</option>
        </select>
        <select
          className="bg-transparent border rounded px-1.5 py-1 text-xs"
          value={speedKey}
          onChange={(e) => setSpeedKey(e.target.value as keyof typeof SPEED_OPTIONS)}
        >
          <option value="lento">Lento</option>
          <option value="normal">Normal</option>
          <option value="rapido">Rápido</option>
        </select>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {isFinal ? "lances encerrados" : `Lance ${Math.min(segIndex + 1, segments.length)} / ${segments.length}`}
        </span>
      </div>

      <div ref={logRef} className="max-h-40 overflow-y-auto text-sm space-y-1 border-t pt-2">
        {visibleEvents.map((e, i) => (
          <div key={i} className={e.type === "goal" ? "font-medium" : "text-muted-foreground"}>
            {e.text}
          </div>
        ))}
      </div>

      {result.stats && (
        <div className="border-t pt-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
            Estatísticas {isFinal ? "da partida" : "até aqui"}
          </div>
          <div className="space-y-1.5 text-xs">
            <StatBar label="Posse de bola" home={liveStats.possession} away={100 - liveStats.possession} suffix="%" />
            <StatBar label="Chutes" home={liveStats.shotsHome} away={liveStats.shotsAway} />
            <StatBar label="No alvo" home={liveStats.onTargetHome} away={liveStats.onTargetAway} />
            <StatBar label="Escanteios" home={liveStats.cornersHome} away={liveStats.cornersAway} />
            <StatBar label="Faltas" home={liveStats.foulsHome} away={liveStats.foulsAway} />
            {(liveStats.yellowHome + liveStats.yellowAway > 0) && (
              <StatBar label="Cartões amarelos" home={liveStats.yellowHome} away={liveStats.yellowAway} />
            )}
            {(liveStats.redHome + liveStats.redAway > 0) && (
              <StatBar label="Cartões vermelhos" home={liveStats.redHome} away={liveStats.redAway} />
            )}
            {isFinal && result.homeAttackRating != null && result.awayAttackRating != null && (
              <StatBar label="Poder ofensivo" home={Math.round(result.homeAttackRating)} away={Math.round(result.awayAttackRating)} />
            )}
          </div>
        </div>
      )}

      {isFinal && ratedHome.length + ratedAway.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Notas dos jogadores</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <RatingsColumn title={homeName} entries={ratedHome} motmId={motm?.playerId} />
            <RatingsColumn title={awayName} entries={ratedAway} motmId={motm?.playerId} />
          </div>
        </div>
      )}
    </div>
  );
}

function ratingColor(r: number) {
  return r >= 8 ? "text-emerald-400" : r >= 6.5 ? "text-foreground" : r >= 5.5 ? "text-amber-400" : "text-red-400";
}

function StatBar({ label, home, away, suffix = "" }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div>
      <div className="flex items-center justify-between text-muted-foreground mb-0.5">
        <span className="font-mono font-semibold text-foreground">{home}{suffix}</span>
        <span>{label}</span>
        <span className="font-mono font-semibold text-foreground">{away}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-muted flex">
        <div className="h-full bg-blue-500" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-rose-500" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function RatingsColumn({
  title, entries, motmId,
}: { title: string; entries: { playerId: string; playerName: string; rating: number; goals: number }[]; motmId?: string }) {
  return (
    <div>
      <div className="font-medium mb-1">{title}</div>
      <div className="space-y-0.5">
        {entries.map((e) => (
          <div key={e.playerId} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {e.playerId === motmId && "👑 "}{e.playerName}{e.goals > 0 ? ` (${e.goals}⚽)` : ""}
            </span>
            <span className={`font-mono font-semibold ${ratingColor(e.rating)}`}>{e.rating.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
