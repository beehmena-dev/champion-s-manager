import { describe, expect, it } from "vitest";
import {
  smoothDamp1D, stepPlayerMotion, applySeparation,
  type PlayerMotionState,
} from "../position-motion";

describe("smoothDamp1D — movimento com estado do 2D (comportamento real de FM Touch)", () => {
  it("converge pro alvo ao longo de várias iterações pequenas", () => {
    let value = 0, vel = 0;
    for (let i = 0; i < 300; i++) {
      [value, vel] = smoothDamp1D(value, vel, 50, 0.2, 30, 1 / 60);
    }
    expect(value).toBeCloseTo(50, 1);
  });

  it("nunca desloca mais que maxSpeed*dt num único passo", () => {
    const dt = 1 / 60;
    const maxSpeed = 30;
    let value = 0, vel = 0;
    [value, vel] = smoothDamp1D(value, vel, 1000, 0.2, maxSpeed, dt);
    expect(Math.abs(value - 0)).toBeLessThanOrEqual(maxSpeed * dt + 1e-9);
  });

  it("dt=0 não altera o estado", () => {
    const [value, vel] = smoothDamp1D(10, 2, 90, 0.2, 30, 0);
    expect(value).toBe(10);
    expect(vel).toBe(2);
  });

  it("alvo estático não causa oscilação/overshoot (nunca passa do alvo e volta)", () => {
    let value = 0, vel = 0;
    let everOvershot = false;
    for (let i = 0; i < 200; i++) {
      [value, vel] = smoothDamp1D(value, vel, 20, 0.2, 30, 1 / 60);
      if (value > 20.001) everOvershot = true;
    }
    expect(everOvershot).toBe(false);
  });

  it("alvo em movimento constante é perseguido sem 'vazar' pra trás (converge pra uma distância estável)", () => {
    let value = 0, vel = 0;
    let target = 0;
    const dt = 1 / 60;
    const targetSpeed = 5; // bem abaixo do maxSpeed, dá pra acompanhar de verdade
    const gaps: number[] = [];
    for (let i = 0; i < 600; i++) {
      target += targetSpeed * dt;
      [value, vel] = smoothDamp1D(value, vel, target, 0.2, 30, dt);
      if (i > 500) gaps.push(target - value);
    }
    // depois de convergir, a distância pro alvo fica estável (não cresce sem parar)
    const first = gaps[0], last = gaps[gaps.length - 1];
    expect(Math.abs(last - first)).toBeLessThan(0.05);
  });
});

describe("stepPlayerMotion", () => {
  it("avança x/y independentemente em direção ao alvo", () => {
    const state: PlayerMotionState = { x: 0, y: 0, vx: 0, vy: 0 };
    const next = stepPlayerMotion(state, { x: 10, y: -10 }, 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.y).toBeLessThan(0);
  });

  it("dt=0 devolve o mesmo estado (posição e velocidade)", () => {
    const state: PlayerMotionState = { x: 5, y: 5, vx: 1, vy: -1 };
    const next = stepPlayerMotion(state, { x: 50, y: 50 }, 0);
    expect(next).toEqual(state);
  });
});

describe("applySeparation — jogadores nunca ficam desenhados um em cima do outro", () => {
  it("dois pontos exatamente sobrepostos terminam com distância >= minDistance depois de uma chamada", () => {
    const points = [{ id: "a", x: 50, y: 50 }, { id: "b", x: 50, y: 50 }];
    const out = applySeparation(points, 3);
    const dist = Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y);
    expect(dist).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it("um par perto (mas não sobreposto) termina com distância exatamente minDistance", () => {
    const points = [{ id: "a", x: 50, y: 50 }, { id: "b", x: 51, y: 50 }];
    const out = applySeparation(points, 3);
    const dist = Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y);
    expect(dist).toBeCloseTo(3, 5);
  });

  it("pontos já bem afastados não mudam", () => {
    const points = [{ id: "a", x: 10, y: 10 }, { id: "b", x: 90, y: 90 }];
    const out = applySeparation(points, 3);
    expect(out[0]).toEqual(points[0]);
    expect(out[1]).toEqual(points[1]);
  });

  it("nunca empurra pra fora dos limites do campo", () => {
    const points = [{ id: "a", x: 1.6, y: 1.6 }, { id: "b", x: 1.6, y: 1.6 }];
    const out = applySeparation(points, 5);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(1.5);
      expect(p.y).toBeGreaterThanOrEqual(1.5);
      expect(p.x).toBeLessThanOrEqual(98.5);
      expect(p.y).toBeLessThanOrEqual(98.5);
    }
  });

  it("é simétrica — A se afasta de B tanto quanto B se afasta de A", () => {
    const points = [{ id: "a", x: 50, y: 50 }, { id: "b", x: 51, y: 50 }];
    const out = applySeparation(points, 3);
    const da = Math.hypot(out[0].x - points[0].x, out[0].y - points[0].y);
    const db = Math.hypot(out[1].x - points[1].x, out[1].y - points[1].y);
    expect(da).toBeCloseTo(db, 5);
  });

  it("não afeta um terceiro ponto já longe dos outros dois", () => {
    const points = [{ id: "a", x: 50, y: 50 }, { id: "b", x: 50.5, y: 50 }, { id: "c", x: 10, y: 10 }];
    const out = applySeparation(points, 3);
    expect(out[2]).toEqual(points[2]);
  });
});
