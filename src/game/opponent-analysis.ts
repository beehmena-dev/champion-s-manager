// -----------------------------------------------------------------------------
// Dossiê do próximo adversário — DNA tático + pontos fortes/fracos derivados
// dos atributos e da tática do rival, recomendação e "homem perigoso".
// Tudo determinístico a partir de dados reais (nada inventado). A tela fica em
// src/routes/_authenticated/saves.$saveId.analysis.tsx.
// -----------------------------------------------------------------------------
import type { PlayerAttributes } from "./attributes";

export interface OppPlayer {
  id: string;
  name: string;
  position: string;
  natural_position?: string | null;
  overall: number;
  squad_number?: number | null;
  attributes?: Partial<PlayerAttributes> | null;
  scout_knowledge?: number | null;
  nationality?: string | null;
}
export interface OppClub {
  name: string;
  formation?: string | null;
  mentality?: string | null;
  passing_style?: string | null;
  defensive_line?: number | null;
  pressing?: number | null;
  tempo?: number | null;
}

const MENT: Record<string, string> = { defensive: "Defensiva", balanced: "Equilibrada", attacking: "Ofensiva" };
const PASS: Record<string, string> = { short: "Curto / posse", mixed: "Misto", direct: "Direto / vertical" };
const level = (n?: number | null): "baixa" | "média" | "alta" => ((n ?? 3) >= 4 ? "alta" : (n ?? 3) <= 2 ? "baixa" : "média");
const avgAttr = (ps: OppPlayer[], k: keyof PlayerAttributes) =>
  ps.length ? ps.reduce((s, p) => s + Number(p.attributes?.[k] ?? 10), 0) / ps.length : 10;

const WIDE = new Set(["PE", "PD", "LE", "LD", "ME", "MD"]);

export interface OpponentDossier {
  dna: { formacao: string; mentalidade: string; construcao: string; linha: string; pressao: string; ritmo: string };
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  dangerMan: (OppPlayer & { watch: string }) | null;
  topPlayers: OppPlayer[];
}

export function analyzeOpponent(club: OppClub, roster: OppPlayer[]): OpponentDossier {
  const sorted = [...roster].sort((a, b) => b.overall - a.overall);
  const xi = sorted.slice(0, 11);
  const defs = xi.filter((p) => p.position === "DEF");
  const mids = xi.filter((p) => p.position === "MID");
  const fwds = xi.filter((p) => p.position === "FWD");
  const wide = xi.filter((p) => WIDE.has(p.natural_position ?? ""));

  const dna = {
    formacao: club.formation ?? "—",
    mentalidade: MENT[club.mentality ?? "balanced"] ?? String(club.mentality ?? "—"),
    construcao: PASS[club.passing_style ?? "mixed"] ?? String(club.passing_style ?? "—"),
    linha: `Linha ${level(club.defensive_line)}`,
    pressao: `Pressão ${level(club.pressing)}`,
    ritmo: `Ritmo ${level(club.tempo)}`,
  };

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (avgAttr(fwds, "finishing") >= 15) strengths.push("Ataque letal na finalização — não conceda chances limpas na área.");
  if (avgAttr(fwds, "pace") >= 15) strengths.push("Atacantes velozes: cuidado com o espaço nas costas da última linha.");
  if (avgAttr(wide, "crossing") >= 14) strengths.push("Perigo constante pelas pontas, com cruzamentos de qualidade.");
  if (avgAttr(mids, "vision") >= 15) strengths.push("Meio-campo criativo que enfia bolas entre as linhas.");
  if ((club.pressing ?? 3) >= 4) strengths.push("Pressão alta e coordenada na saída de bola adversária.");

  if ((club.defensive_line ?? 3) >= 4) weaknesses.push("Linha adiantada — lançamentos e infiltração em profundidade rendem.");
  if ((club.pressing ?? 3) <= 2) weaknesses.push("Pressão fraca: haverá tempo para construir com calma.");
  if (avgAttr(defs, "heading") <= 11) weaknesses.push("Frágil no jogo aéreo — abuse de escanteios, faltas laterais e cruzamentos.");
  if (avgAttr(defs, "pace") <= 11) weaknesses.push("Zaga lenta — ataque em velocidade e transições diretas.");
  if (avgAttr(defs, "tackling") <= 11) weaknesses.push("Desarme pobre na defesa — o drible no último terço compensa.");
  if ((club.mentality ?? "balanced") === "attacking") weaknesses.push("Postura ofensiva deixa o meio exposto ao contra-ataque.");

  if (strengths.length === 0) strengths.push("Equipe equilibrada, sem um ponto forte que se destaque.");
  if (weaknesses.length === 0) weaknesses.push("Time compacto — criar chances claras vai custar.");

  const rec: string[] = [];
  if (avgAttr(defs, "pace") <= 11 || (club.defensive_line ?? 3) >= 4) rec.push("priorizar transições rápidas e bola em profundidade");
  else rec.push("ter paciência na construção e circular a bola para abrir espaços");
  if (avgAttr(defs, "heading") <= 11) rec.push("explorar bolas paradas e cruzamentos");
  if ((club.pressing ?? 3) >= 4) rec.push("saída de bola mais direta para furar a pressão");
  const recommendation = `Plano sugerido: ${rec.join("; ")}.`;

  // Homem perigoso: não é só o maior overall — pondera ameaça ofensiva real
  // (posição de ataque + finalização/movimentação/drible).
  const threatScore = (p: OppPlayer) => {
    const a = p.attributes ?? {};
    const off = (Number(a.finishing ?? 8) + Number(a.off_the_ball ?? 8) + Number(a.dribbling ?? 8) + Number(a.long_shots ?? 8)) / 4;
    const posBonus = p.position === "FWD" ? 8 : p.position === "MID" ? 3 : 0;
    return p.overall + posBonus + (off - 10) * 1.2;
  };
  const top = [...roster].sort((a, b) => threatScore(b) - threatScore(a))[0];
  const dangerMan = top ? { ...top, watch: watchInstruction(top) } : null;

  return {
    dna,
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    recommendation,
    dangerMan,
    topPlayers: sorted.slice(0, 5),
  };
}

function watchInstruction(p: OppPlayer): string {
  const a = p.attributes ?? {};
  const pace = Number(a.pace ?? 10);
  const drib = Number(a.dribbling ?? 10);
  const fin = Number(a.finishing ?? 10);
  const head = Number(a.heading ?? 10);
  if (p.position === "FWD" && fin >= 15) return "Marcação individual na área e antecipe o cruzamento antes que ele finalize.";
  if (drib >= 15 || pace >= 16) return "Dobra de marcação — não dê o 1x1, force para a linha de fundo.";
  if (head >= 16) return "Não o deixe subir livre em bola aérea; dispute todo escanteio.";
  return "Reduza o tempo de bola dele e feche as linhas de passe.";
}
