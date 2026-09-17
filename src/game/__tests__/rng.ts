// Mesmo gerador determinístico do motor (ver simulation.ts) — não exportado
// de lá de propósito (é detalhe de implementação), então os testes têm a
// própria cópia só pra terem um RNG estável sem depender de Math.random.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
