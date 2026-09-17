// -----------------------------------------------------------------------------
// Contexto de partida — árbitro (Lei 5) e clima/gramado (Lei 1). Ambos são
// determinísticos pela MESMA semente que o resto do motor (ver
// simulation.ts::hashSeed) — ficam estáveis entre os vários trechos de uma
// partida ao vivo (15'/30'/intervalo/60'/75'/final) porque cada trecho chama
// simulateMatchSegment de novo com o mesmo `seed`, mas variam de partida pra
// partida sem precisar de tabela nova no banco (mesma filosofia "procedural
// por padrão" já usada pra brasão/kit/rosto — aqui nem precisa de opção de
// upload do usuário, é só sabor determinístico).
// -----------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Árbitro -----------------------------------------------------------------

export interface RefereeProfile {
  name: string;
  strictness: number; // 1 (permissivo, deixa jogar) .. 5 (rigoroso, apita tudo)
}

const REFEREE_FIRST_NAMES = [
  "Anderson", "Bruno", "Carlos", "Diego", "Fernando", "Gustavo", "Henrique", "Igor",
  "João", "Leandro", "Marcelo", "Nilton", "Otávio", "Paulo", "Rafael", "Sandro", "Thiago", "Vinícius",
];
const REFEREE_LAST_NAMES = [
  "Almeida", "Barbosa", "Cunha", "Daronco", "Esteves", "Fagundes", "Guerra", "Homem",
  "Irineu", "Junqueira", "Lima", "Martins", "Nogueira", "Oliveira", "Pinheiro", "Ramalho", "Souza", "Teixeira",
];

/** Perfil do árbitro desta partida — mesmo perfil em todos os trechos ao vivo. */
export function refereeForMatch(seed: string): RefereeProfile {
  const h = hash(`${seed}::referee`);
  const name = `${REFEREE_FIRST_NAMES[h % REFEREE_FIRST_NAMES.length]} ${REFEREE_LAST_NAMES[(h >>> 8) % REFEREE_LAST_NAMES.length]}`;
  // Distribuição concentrada no meio (maioria "equilibrado"), não uniforme —
  // árbitro extremamente rigoroso ou extremamente frouxo é minoria, como na vida real.
  const roll = ((h >>> 16) % 100) / 100;
  const strictness = roll < 0.12 ? 1 : roll < 0.35 ? 2 : roll < 0.65 ? 3 : roll < 0.88 ? 4 : 5;
  return { name, strictness };
}

export interface RefereeCoefs {
  cards: number;      // multiplicador sobre a frequência de cartão
  stoppage: number;   // multiplicador sobre os minutos de acréscimo
}

export function refereeCoefs(strictness: number): RefereeCoefs {
  return {
    cards: 0.7 + strictness * 0.15,   // 1→0.85 .. 5→1.45
    stoppage: 0.8 + strictness * 0.1, // rigoroso para mais o jogo → mais acréscimo
  };
}

// --- Clima e gramado -----------------------------------------------------------

export type Weather = "limpo" | "chuva" | "calor" | "vento" | "neve";
export type PitchCondition = "bom" | "gasto" | "pesado" | "gelado";

export interface MatchWeather {
  weather: Weather;
  pitch: PitchCondition;
  label: string;
}

const WEATHER_LABEL: Record<Weather, string> = {
  limpo: "Tempo limpo", chuva: "Chuva", calor: "Calor forte", vento: "Vento forte", neve: "Neve",
};

/** Clima e estado do gramado desta partida — chuva/neve puxam o gramado pra pesado/gelado com mais chance. */
export function weatherForMatch(seed: string): MatchWeather {
  const h = hash(`${seed}::weather`);
  const roll = (h % 100) / 100;
  const weather: Weather =
    roll < 0.62 ? "limpo" : roll < 0.78 ? "chuva" : roll < 0.88 ? "calor" : roll < 0.96 ? "vento" : "neve";
  const pitchRoll = ((h >>> 8) % 100) / 100;
  let pitch: PitchCondition;
  if (weather === "chuva") pitch = pitchRoll < 0.55 ? "pesado" : pitchRoll < 0.85 ? "gasto" : "bom";
  else if (weather === "neve") pitch = pitchRoll < 0.7 ? "gelado" : "pesado";
  else pitch = pitchRoll < 0.15 ? "gasto" : "bom";
  const label = WEATHER_LABEL[weather] + (pitch !== "bom" ? ` — gramado ${pitch}` : "");
  return { weather, pitch, label };
}

export interface WeatherCoefs {
  chance: number;  // frequência de chance/chute
  injury: number;  // risco de lesão
  setpiece: number; // precisão de bola parada (escanteio/falta)
}

/** Multiplicadores de clima/gramado — chuva/neve atrapalham precisão e sobem lesão; calor cansa; vento atrapalha bola parada. */
export function weatherCoefs(w: MatchWeather): WeatherCoefs {
  const c: WeatherCoefs = { chance: 1, injury: 1, setpiece: 1 };
  if (w.weather === "chuva") { c.chance *= 0.94; c.injury *= 1.15; c.setpiece *= 0.92; }
  if (w.weather === "calor") { c.injury *= 1.1; }
  if (w.weather === "vento") { c.setpiece *= 0.8; c.chance *= 0.97; }
  if (w.weather === "neve") { c.chance *= 0.88; c.injury *= 1.2; c.setpiece *= 0.85; }
  if (w.pitch === "pesado") { c.chance *= 0.93; c.injury *= 1.15; }
  if (w.pitch === "gasto") { c.injury *= 1.08; }
  if (w.pitch === "gelado") { c.injury *= 1.25; c.chance *= 0.9; }
  return c;
}

// --- Acréscimo -----------------------------------------------------------------

/**
 * Minutos de acréscimo ao fim de um tempo (Lei 7 — "modele como função dos
 * eventos, não valor fixo"). Soma frações por gol (comemoração), cartão
 * (parada), lesão (atendimento) e revisão do VAR (Lei 6 — "consome tempo,
 * deve gerar acréscimo") ocorridos NESSE tempo, escalado pelo rigor do
 * árbitro e pelo gramado (atendimento mais lento em condição ruim).
 * Substituição não entra aqui — troca acontece FORA do motor (ver
 * src/lib/live-match.ts), simulateMatchSegment não enxerga quantas rolaram.
 */
export function computeStoppageMinutes(
  eventsInHalf: { type: string }[],
  strictness: number,
  weather: MatchWeather,
): number {
  let mins = 0.5; // base mínima real (bola parada nos últimos minutos)
  for (const e of eventsInHalf) {
    if (e.type === "goal") mins += 0.9;
    if (e.type === "injury") mins += 1.4;
    if (e.type === "var") mins += 1.2;
    if (e.type === "yellow") mins += 0.25;
    if (e.type === "red") mins += 0.6;
  }
  const weatherMul = weather.pitch === "bom" ? 1 : 1.1;
  return Math.max(1, Math.min(9, Math.round(mins * refereeCoefs(strictness).stoppage * weatherMul)));
}
