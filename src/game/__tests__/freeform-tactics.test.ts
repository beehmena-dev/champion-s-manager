import { describe, expect, it } from "vitest";
import { canonicalFromCoords, detectFormationLabel, positionGroupFromY, FORMATIONS } from "../tactics";
import { FORMATION_LAYOUT } from "../formation-layout";
import type { FormationCode } from "../types";

describe("detectFormationLabel", () => {
  it("reproduz o próprio nome de cada template pronto a partir das coordenadas de FORMATION_LAYOUT", () => {
    for (const code of Object.keys(FORMATIONS) as FormationCode[]) {
      const slots = FORMATIONS[code];
      const layout = FORMATION_LAYOUT[code];
      const outfieldY = slots
        .filter((s) => s.position !== "GK")
        .map((s) => layout[s.slot].y);
      expect(detectFormationLabel(outfieldY)).toBe(code);
    }
  });

  it("devolve string vazia pra lista vazia", () => {
    expect(detectFormationLabel([])).toBe("");
  });

  it("junta jogadores na mesma linha quando a profundidade é bem próxima", () => {
    // 4 zagueiros em linha quase reta (76-80) devem contar como uma linha só
    expect(detectFormationLabel([76, 78, 80, 77])).toBe("4");
  });

  it("separa em linhas distintas quando o vão de profundidade é grande", () => {
    // 2 recuados bem atrás + 2 avançados bem na frente — vão de 50+ pontos
    expect(detectFormationLabel([80, 78, 15, 12])).toBe("2-2");
  });
});

describe("positionGroupFromY", () => {
  it("classifica por profundidade: recuado=DEF, meio=MID, avançado=FWD", () => {
    expect(positionGroupFromY(80)).toBe("DEF");
    expect(positionGroupFromY(65)).toBe("DEF");
    expect(positionGroupFromY(50)).toBe("MID");
    expect(positionGroupFromY(33)).toBe("MID");
    expect(positionGroupFromY(20)).toBe("FWD");
  });
});

describe("canonicalFromCoords", () => {
  it("reconhece um zagueiro central recuado", () => {
    expect(canonicalFromCoords(50, 78)).toBe("ZAG");
  });

  it("reconhece um lateral/ala pelos dois eixos (largura E profundidade)", () => {
    expect(canonicalFromCoords(85, 70)).toBe("LD");
    expect(canonicalFromCoords(15, 70)).toBe("LE");
  });

  it("reconhece um centroavante bem avançado e central", () => {
    expect(canonicalFromCoords(50, 10)).toBe("CA");
  });

  it("reconhece uma ponta avançada e aberta", () => {
    expect(canonicalFromCoords(82, 16)).toBe("PD");
    expect(canonicalFromCoords(18, 16)).toBe("PE");
  });

  it("nunca devolve GOL — um zagueiro empurrado até o fundo continua sendo posição de linha", () => {
    expect(canonicalFromCoords(50, 95)).not.toBe("GOL");
  });
});
