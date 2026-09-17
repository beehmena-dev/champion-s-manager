import type { FormationCode } from "./types";

// Coordenadas percentuais (x: 0=esquerda, 100=direita | y: 0=gol adversário
// no topo, 100=seu gol embaixo) de cada slot, por formação. Usado só pra
// desenho do campo — a lógica de força/familiaridade continua em tactics.ts.
export const FORMATION_LAYOUT: Record<FormationCode, Record<string, { x: number; y: number }>> = {
  "4-4-2": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    LM: { x: 15, y: 45 }, LCM: { x: 38, y: 50 }, RCM: { x: 62, y: 50 }, RM: { x: 85, y: 45 },
    LST: { x: 38, y: 15 }, RST: { x: 62, y: 15 },
  },
  "4-3-3": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    DM: { x: 50, y: 56 }, LCM: { x: 30, y: 46 }, RCM: { x: 70, y: 46 },
    LW: { x: 15, y: 16 }, ST: { x: 50, y: 10 }, RW: { x: 85, y: 16 },
  },
  "4-2-3-1": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    LDM: { x: 35, y: 58 }, RDM: { x: 65, y: 58 },
    LAM: { x: 20, y: 30 }, CAM: { x: 50, y: 28 }, RAM: { x: 80, y: 30 },
    ST: { x: 50, y: 10 },
  },
  "3-5-2": {
    GK: { x: 50, y: 92 },
    LCB: { x: 30, y: 76 }, CB: { x: 50, y: 79 }, RCB: { x: 70, y: 76 },
    LWB: { x: 8, y: 50 }, LCM: { x: 32, y: 48 }, CM: { x: 50, y: 50 }, RCM: { x: 68, y: 48 }, RWB: { x: 92, y: 50 },
    LST: { x: 38, y: 15 }, RST: { x: 62, y: 15 },
  },
  "5-3-2": {
    GK: { x: 50, y: 92 },
    LWB: { x: 8, y: 66 }, LCB: { x: 30, y: 76 }, CB: { x: 50, y: 79 }, RCB: { x: 70, y: 76 }, RWB: { x: 92, y: 66 },
    LCM: { x: 30, y: 48 }, CM: { x: 50, y: 50 }, RCM: { x: 70, y: 48 },
    LST: { x: 38, y: 15 }, RST: { x: 62, y: 15 },
  },
  "4-1-4-1": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    DM: { x: 50, y: 58 },
    LM: { x: 15, y: 40 }, LCM: { x: 38, y: 42 }, RCM: { x: 62, y: 42 }, RM: { x: 85, y: 40 },
    ST: { x: 50, y: 12 },
  },
  "4-5-1": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    LM: { x: 12, y: 46 }, LCM: { x: 32, y: 48 }, CM: { x: 50, y: 52 }, RCM: { x: 68, y: 48 }, RM: { x: 88, y: 46 },
    ST: { x: 50, y: 12 },
  },
  "3-4-3": {
    GK: { x: 50, y: 92 },
    LCB: { x: 30, y: 78 }, CB: { x: 50, y: 80 }, RCB: { x: 70, y: 78 },
    LWB: { x: 10, y: 52 }, LCM: { x: 35, y: 50 }, RCM: { x: 65, y: 50 }, RWB: { x: 90, y: 52 },
    LW: { x: 18, y: 16 }, ST: { x: 50, y: 10 }, RW: { x: 82, y: 16 },
  },
  "4-4-1-1": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    LM: { x: 15, y: 46 }, LCM: { x: 38, y: 50 }, RCM: { x: 62, y: 50 }, RM: { x: 85, y: 46 },
    SS: { x: 50, y: 24 }, ST: { x: 50, y: 10 },
  },
  "5-4-1": {
    GK: { x: 50, y: 92 },
    LWB: { x: 8, y: 68 }, LCB: { x: 30, y: 78 }, CB: { x: 50, y: 80 }, RCB: { x: 70, y: 78 }, RWB: { x: 92, y: 68 },
    LM: { x: 15, y: 44 }, LCM: { x: 38, y: 46 }, RCM: { x: 62, y: 46 }, RM: { x: 85, y: 44 },
    ST: { x: 50, y: 10 },
  },
  "4-3-1-2": {
    GK: { x: 50, y: 92 },
    LB: { x: 15, y: 70 }, LCB: { x: 37, y: 76 }, RCB: { x: 63, y: 76 }, RB: { x: 85, y: 70 },
    DM: { x: 50, y: 58 }, LCM: { x: 32, y: 48 }, RCM: { x: 68, y: 48 },
    AM: { x: 50, y: 28 },
    LST: { x: 38, y: 12 }, RST: { x: 62, y: 12 },
  },
};

export function slotCoords(formation: FormationCode, slot: string): { x: number; y: number } {
  return FORMATION_LAYOUT[formation]?.[slot] ?? { x: 50, y: 50 };
}
