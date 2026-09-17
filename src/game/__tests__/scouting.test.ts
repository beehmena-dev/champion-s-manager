import { describe, expect, it } from "vitest";
import { baseKnowledge, effectiveKnowledge, tierFor, fuzzRange, KNOWLEDGE_TIERS } from "../scouting";

describe("baseKnowledge — item 02 do backlog (fog of war por fama)", () => {
  it("um astro global de clube badalado já nasce 'Conhecido a fundo' sem nenhum olheiro (pedido explícito do card)", () => {
    // Perfil real de base FM24 importada: Mbappé 95 overall, Real Madrid reputação 91.
    const k = baseKnowledge(91, 95);
    expect(k).toBeGreaterThanOrEqual(85);
    expect(tierFor(k).label).toBe("Conhecido a fundo");
    expect(tierFor(k).attrSpread).toBe(0); // atributos exatos, sem faixa
  });

  it("jogador mediano de clube pequeno fica perto de zero — precisa de olheiro de verdade", () => {
    // Perfil real: Arturo Fregoso, overall 40, Remo reputação 49.
    const k = baseKnowledge(49, 40);
    expect(k).toBeLessThan(25);
    expect(tierFor(k).label).toBe("Pouco conhecido");
  });

  it("jogador médio (perfil de liga comum) fica no meio, sem ser exato nem totalmente desconhecido", () => {
    const k = baseKnowledge(67, 73); // médias reais da base importada
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(85);
  });

  it("cresce com overall e com reputação do clube (nunca cai quando um dos dois sobe)", () => {
    expect(baseKnowledge(60, 80)).toBeGreaterThan(baseKnowledge(60, 70));
    expect(baseKnowledge(80, 70)).toBeGreaterThan(baseKnowledge(60, 70));
  });

  it("nunca sai de 0-100 mesmo em extremos", () => {
    expect(baseKnowledge(0, 1)).toBeGreaterThanOrEqual(0);
    expect(baseKnowledge(100, 99)).toBeLessThanOrEqual(100);
  });
});

describe("effectiveKnowledge + olheiro", () => {
  it("escalar olheiro sobe um jogador desconhecido pra faixas mais altas de conhecimento", () => {
    const unknown = effectiveKnowledge(0, 49, 40);
    const scouted = effectiveKnowledge(60, 49, 40);
    expect(scouted).toBeGreaterThan(unknown);
    expect(tierFor(scouted).attrSpread).toBeLessThanOrEqual(tierFor(unknown).attrSpread === -1 ? Infinity : tierFor(unknown).attrSpread);
  });

  it("conhecimento efetivo nunca passa de 100 mesmo com fama alta + olheiro no teto", () => {
    expect(effectiveKnowledge(100, 91, 95)).toBeLessThanOrEqual(100);
  });
});

describe("tierFor — cobre os 4 tiers sem buraco", () => {
  it("cada tier declarado é alcançável e a lista está ordenada por min decrescente", () => {
    for (let i = 1; i < KNOWLEDGE_TIERS.length; i++) {
      expect(KNOWLEDGE_TIERS[i - 1].min).toBeGreaterThan(KNOWLEDGE_TIERS[i].min);
    }
    expect(tierFor(0).label).toBe("Pouco conhecido");
    expect(tierFor(100).label).toBe("Conhecido a fundo");
  });
});

describe("fuzzRange", () => {
  it("spread 0 devolve o valor exato, sem faixa", () => {
    expect(fuzzRange(75, 0, "seed")).toEqual([75, 75]);
  });

  it("mesma seed sempre devolve a mesma faixa (não muda a cada render)", () => {
    const a = fuzzRange(70, 6, "player-1-overall");
    const b = fuzzRange(70, 6, "player-1-overall");
    expect(a).toEqual(b);
  });

  it("a faixa sempre contém valores plausíveis (1-99) e tem largura coerente com o spread", () => {
    const [lo, hi] = fuzzRange(70, 6, "seed-x");
    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeLessThanOrEqual(99);
    expect(hi - lo).toBeGreaterThan(0);
    expect(hi - lo).toBeLessThanOrEqual(6 * 2 + Math.round(6 * 1.4));
  });
});
