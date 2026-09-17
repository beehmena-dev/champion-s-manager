// Fixtures pra teste puro do motor — sem banco, sem React, só os tipos de
// domínio (ver src/game/types.ts). Todo teste do motor deve montar
// jogadores/clubes por aqui em vez de literais soltos, pra não divergir do
// shape real (PlayerAttributes tem 47 campos — esquecer um quebra em
// runtime, não em compile-time, já que a maioria dos acessos usa `?? 10`).
import type { ClubLike, GranularPosition, PlayerLike, Position } from "../types";
import type { PlayerAttributes } from "../attributes";

const ATTR_KEYS: (keyof PlayerAttributes)[] = [
  "corners", "crossing", "dribbling", "finishing", "first_touch", "free_kick_taking",
  "heading", "long_shots", "long_throws", "marking", "passing", "penalty_taking", "tackling", "technique",
  "aggression", "anticipation", "bravery", "composure", "concentration", "decisions",
  "determination", "flair", "leadership", "off_the_ball", "positioning", "teamwork", "vision", "work_rate",
  "acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace", "stamina", "strength",
  "aerial_reach", "command_of_area", "communication", "eccentricity", "handling", "kicking",
  "one_on_ones", "reflexes", "rushing_out", "tendency_to_punch", "throwing",
];

export function makeAttributes(overrides: Partial<PlayerAttributes> = {}, base = 12): PlayerAttributes {
  const attrs = {} as PlayerAttributes;
  for (const k of ATTR_KEYS) attrs[k] = base;
  return { ...attrs, ...overrides };
}

let counter = 0;

export function makePlayer(input: {
  id?: string;
  name?: string;
  position: Position;
  natural_position: GranularPosition;
  attrs?: Partial<PlayerAttributes>;
  overall?: number;
  condition?: number;
  club_since?: string | null;
}): PlayerLike {
  counter++;
  const id = input.id ?? `p${counter}`;
  return {
    id,
    name: input.name ?? `Jogador ${id}`,
    position: input.position,
    natural_position: input.natural_position,
    secondary_positions: [],
    position_progress: { [input.natural_position]: 100 },
    overall: input.overall ?? 70,
    attributes: makeAttributes(input.attrs ?? {}),
    form: 70,
    morale: 70,
    condition: input.condition ?? 100,
    club_since: input.club_since ?? null,
  };
}

/** XI completo (4-3-3), todos em posição natural — cobre GK/DEF/MID/FWD. */
export function makeXI(prefix: string, attrs: Partial<PlayerAttributes> = {}): PlayerLike[] {
  return [
    makePlayer({ id: `${prefix}-gk`, position: "GK", natural_position: "GOL", attrs }),
    makePlayer({ id: `${prefix}-lb`, position: "DEF", natural_position: "LE", attrs }),
    makePlayer({ id: `${prefix}-cb1`, position: "DEF", natural_position: "ZAG", attrs }),
    makePlayer({ id: `${prefix}-cb2`, position: "DEF", natural_position: "ZAG", attrs }),
    makePlayer({ id: `${prefix}-rb`, position: "DEF", natural_position: "LD", attrs }),
    makePlayer({ id: `${prefix}-dm`, position: "MID", natural_position: "VOL", attrs }),
    makePlayer({ id: `${prefix}-cm1`, position: "MID", natural_position: "MC", attrs }),
    makePlayer({ id: `${prefix}-cm2`, position: "MID", natural_position: "MEI", attrs }),
    makePlayer({ id: `${prefix}-lw`, position: "FWD", natural_position: "PE", attrs }),
    makePlayer({ id: `${prefix}-st`, position: "FWD", natural_position: "CA", attrs }),
    makePlayer({ id: `${prefix}-rw`, position: "FWD", natural_position: "PD", attrs }),
  ];
}

export function makeClub(overrides: Partial<ClubLike> = {}): ClubLike {
  return {
    id: "club-x",
    name: "Clube X",
    short_name: "CLX",
    morale: 70,
    reputation: 60,
    formation: "4-3-3",
    mentality: "balanced",
    pressing: 3,
    defensive_line: 3,
    tempo: 3,
    passing_style: "mixed",
    ...overrides,
  };
}
