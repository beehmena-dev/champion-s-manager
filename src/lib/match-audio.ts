// Áudio do visualizador de partida — sintetizado via Web Audio API, sem
// nenhum arquivo de som externo. Cobre: murmúrio contínuo da torcida,
// tensão que sobe em lance perigoso/gol (rampa rápida-sobe/devagar-desce),
// apito (início da mostra + cartão), explosão pontual no gol e sininho de
// substituição. Ligado em src/components/match-pitch.tsx (2D) — existia
// originalmente só no visualizador 3D, removido do projeto em 15/09/2026;
// a engine em si nunca dependeu de Three.js, só precisou ser portada.
//
// `start()` precisa ser chamado num gesto do usuário — o navegador bloqueia
// áudio sem isso; chamamos de novo (idempotente) nos cliques de
// Assistir/Pausar e no botão de mudo, que com certeza são gestos.

const NOISE_SECONDS = 2;

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class MatchAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private bus: GainNode | null = null;      // soma tudo antes do limitador
  private muteGain: GainNode | null = null; // 0/1, com rampa suave
  private bedGain: GainNode | null = null;
  private tensionGain: GainNode | null = null;
  private tension = 0;
  private muted = false;
  private crowdFill = 0.7;
  private started = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) this.ctx = new Ctor();
    return this.ctx;
  }

  start(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (this.started) return;
    this.started = true;

    this.noiseBuffer = makeNoiseBuffer(ctx);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    this.bus.connect(compressor);

    this.muteGain = ctx.createGain();
    this.muteGain.gain.value = this.muted ? 0 : 1;
    compressor.connect(this.muteGain);
    this.muteGain.connect(ctx.destination);

    // Cama contínua de torcida: 2 camadas de ruído filtrado, taxas de
    // reprodução diferentes pra não soarem idênticas (loop de ruído puro
    // não tem "costura" audível, então não precisa alinhar zero-crossing).
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = this.bedLevel();
    this.bedGain.connect(this.bus);
    this.addNoiseLayer(ctx, this.bedGain, 480, 0.7, 0.85, 0, 1);
    this.addNoiseLayer(ctx, this.bedGain, 950, 0.5, 1.05, 0.4, 0.7);

    // Tensão (lance perigoso / gol) — outra camada, mais aberta, controlada
    // por setTension() via rampa exponencial.
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionGain.connect(this.bus);
    this.addNoiseLayer(ctx, this.tensionGain, 1400, 1.1, 0.95, 0.2, 1);
  }

  private addNoiseLayer(
    ctx: AudioContext, dest: AudioNode, freq: number, q: number, rate: number, offsetSec: number, peak: number,
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(filter).connect(g).connect(dest);
    src.start(ctx.currentTime, offsetSec % NOISE_SECONDS);
  }

  private bedLevel(): number {
    return 0.05 + this.crowdFill * 0.15;
  }

  setCrowdFill(fill: number): void {
    this.crowdFill = Math.max(0, Math.min(1, fill));
    if (this.bedGain && this.ctx) {
      this.bedGain.gain.setTargetAtTime(this.bedLevel(), this.ctx.currentTime, 1.2);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.muteGain && this.ctx) {
      this.muteGain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.08);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  // 0 = calmo, ~0.35 = lance perigoso, 1 = gol.
  setTension(level: number): void {
    if (!this.tensionGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = Math.max(0, Math.min(1, level)) * 0.55;
    const rising = target > this.tension;
    this.tensionGain.gain.setTargetAtTime(target, now, rising ? 0.15 : 1.6);
    this.tension = target;
  }

  // Explosão pontual no instante do gol — o setTension(1) chamado junto
  // sustenta o resto da comemoração.
  goalBurst(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.55, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
    src.connect(filter).connect(g).connect(this.bus);
    src.start(now);
    src.stop(now + 3.3);
  }

  whistle(long = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;
    const bus = this.bus;
    const blow = (t0: number, dur: number) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(2350, t0);
      osc.frequency.linearRampToValueAtTime(2600, t0 + dur * 0.5);
      osc.frequency.linearRampToValueAtTime(2300, t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.24, t0 + 0.02);
      g.gain.setValueAtTime(0.24, t0 + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };
    blow(now, 0.32);
    if (long) { blow(now + 0.45, 0.32); blow(now + 0.9, 0.5); }
  }

  subChime(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;
    const bus = this.bus;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const t0 = now + i * 0.11;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      osc.connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + 0.4);
    });
  }

  dispose(): void {
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.started = false;
  }
}
