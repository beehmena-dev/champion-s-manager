// -----------------------------------------------------------------------------
// Kit de UI do FootyManager — componentes compostos, reaproveitáveis, que dão a
// linguagem visual "de produto" a todas as telas (Fase 1 do roadmap). Ficam
// aqui, separados de src/components/ui/* (que é shadcn cru), porque são
// específicos deste app: cabeçalho de tela, cartão de métrica, barras de
// stat/progresso, pill por tom, sub-abas, hero e estado vazio.
//
// Tokens de cor por categoria vêm de src/styles.css: ok / info / warn / danger
// / strategy (+ superfície `elevated`).
// -----------------------------------------------------------------------------
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, X, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Tom de cor compartilhado -------------------------------------------------
export type Tone = "ok" | "info" | "warn" | "danger" | "strategy" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  info: "text-info",
  warn: "text-warn",
  danger: "text-danger",
  strategy: "text-strategy",
  neutral: "text-muted-foreground",
};

// -----------------------------------------------------------------------------
// Pill — badge pequeno por tom (estado ou categoria). `solid` preenche.
// -----------------------------------------------------------------------------
const pillVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "border-ok/30 bg-ok/12 text-ok",
        info: "border-info/30 bg-info/12 text-info",
        warn: "border-warn/30 bg-warn/12 text-warn",
        danger: "border-danger/30 bg-danger/12 text-danger",
        strategy: "border-strategy/30 bg-strategy/12 text-strategy",
        neutral: "border-border bg-secondary text-secondary-foreground",
      },
      solid: { true: "border-transparent", false: "" },
    },
    compoundVariants: [
      { tone: "ok", solid: true, class: "bg-ok text-[color:var(--primary-foreground)]" },
      { tone: "info", solid: true, class: "bg-info text-black" },
      { tone: "warn", solid: true, class: "bg-warn text-black" },
      { tone: "danger", solid: true, class: "bg-danger text-white" },
      { tone: "strategy", solid: true, class: "bg-strategy text-white" },
      { tone: "neutral", solid: true, class: "bg-foreground/80 text-background" },
    ],
    defaultVariants: { tone: "neutral", solid: false },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function Pill({ className, tone, solid, ...props }: PillProps) {
  return <span className={cn(pillVariants({ tone, solid }), className)} {...props} />;
}

// -----------------------------------------------------------------------------
// ratingTone / RatingBadge — leitura de cor única pra qualquer número 0-100
// (overall, ameaça de um jogador do adversário, % de familiaridade etc.), no
// estilo FM: verde forte → azulado → neutro → âmbar → vermelho. Antes cada
// tela reinventava sua própria régua (squad.tsx só tinha ok/info/neutro,
// tactics.tsx e analysis.tsx mostravam o número cru sem cor nenhuma) — vira
// tudo essa mesma função, pra um "OVR 91" ler igual em qualquer tela.
// -----------------------------------------------------------------------------
export function ratingTone(v: number): Tone {
  if (v >= 80) return "ok";
  if (v >= 60) return "info";
  if (v >= 40) return "neutral";
  if (v >= 20) return "warn";
  return "danger";
}

const RATING_BADGE_BG: Record<Tone, string> = {
  ok: "bg-ok/15 text-ok",
  info: "bg-info/15 text-info",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  strategy: "bg-strategy/15 text-strategy",
  neutral: "bg-muted text-foreground",
};

export function RatingBadge({
  value,
  tone,
  className,
}: {
  value: number | string;
  /** Tom explícito — omitir deixa `ratingTone(Number(value))` decidir. */
  tone?: Tone;
  className?: string;
}) {
  const t = tone ?? ratingTone(Number(value));
  return (
    <span
      className={cn(
        "inline-block min-w-7 rounded px-1.5 py-0.5 text-center font-mono text-xs font-bold",
        RATING_BADGE_BG[t],
        className,
      )}
    >
      {value}
    </span>
  );
}

// -----------------------------------------------------------------------------
// PageHeader — abre toda tela igual: ícone no tom, título display, subtítulo,
// ações à direita. Renderiza como um Card raso.
// -----------------------------------------------------------------------------
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  tone = "ok",
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tone?: Tone;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn("mt-0.5 shrink-0", TONE_TEXT[tone])}>
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// MetricCard — número grande + label + ícone. Clicável se receber `onClick`.
// -----------------------------------------------------------------------------
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-colors",
        interactive && "cursor-pointer hover:border-foreground/20 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="fm-eyebrow">{label}</span>
        {Icon && <Icon className={cn("size-4", TONE_TEXT[tone])} />}
      </div>
      <div className={cn("font-display text-2xl font-bold tracking-tight", tone !== "neutral" && TONE_TEXT[tone])}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// MeterBar — barra de progresso fina (0-100). StatBar — comparação casa ×
// visitante (duas metades proporcionais, valores nas pontas).
// -----------------------------------------------------------------------------
const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok",
  info: "bg-info",
  warn: "bg-warn",
  danger: "bg-danger",
  strategy: "bg-strategy",
  neutral: "bg-muted-foreground",
};

export function MeterBar({
  value,
  tone = "ok",
  label,
  showValue,
  className,
}: {
  value: number; // 0-100
  tone?: Tone;
  label?: React.ReactNode;
  showValue?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          {label && <span>{label}</span>}
          {showValue && <span className="font-mono font-semibold text-foreground">{Math.round(v)}%</span>}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-300", TONE_BG[tone])} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function StatBar({
  label,
  home,
  away,
  suffix = "",
  className,
}: {
  label: React.ReactNode;
  home: number;
  away: number;
  suffix?: string;
  className?: string;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  return (
    <div className={className}>
      <div className="mb-0.5 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">
          {home}
          {suffix}
        </span>
        <span>{label}</span>
        <span className="font-mono font-semibold text-foreground">
          {away}
          {suffix}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-info" style={{ width: `${homePct}%` }} />
        <div className="h-full bg-danger" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SubTabs — pills internas de tela (troca de seção sem trocar de rota).
// -----------------------------------------------------------------------------
export interface SubTab<T extends string = string> {
  value: T;
  label: React.ReactNode;
  badge?: number | string;
}

export function SubTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  className,
}: {
  tabs: SubTab<T>[];
  value: T;
  onValueChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-lg border bg-background p-1", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onValueChange(t.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.badge != null && (
              <span
                className={cn(
                  "rounded-full px-1 text-[10px] font-bold leading-4",
                  active ? "bg-primary-foreground/20" : "bg-muted text-foreground",
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SubViewDropdown — 2º nível de navegação estilo FM ("Visão Geral ▾"): troca
// entre MODOS de uma mesma aba (ex. classificação atual × histórico de
// temporadas) sem trocar de rota e sem virar mais uma pill no `SubTabs` já
// existente. Select nativo por baixo (acessível, sem popover pra manter
// aberto/fechar sozinho) só com a aparência de dropdown.
// -----------------------------------------------------------------------------
export interface SubViewOption<T extends string = string> {
  value: T;
  label: string;
}

export function SubViewDropdown<T extends string>({
  options,
  value,
  onValueChange,
  className,
}: {
  options: SubViewOption<T>[];
  value: T;
  onValueChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value as T)}
        className="appearance-none rounded-md border bg-background py-1.5 pl-2.5 pr-7 text-xs font-semibold text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// HeroBanner — faixa de destaque no topo do Painel: gradiente sutil, eyebrow,
// título grande, texto e um CTA opcional.
// -----------------------------------------------------------------------------
export function HeroBanner({
  eyebrow,
  title,
  children,
  action,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6",
        "bg-[linear-gradient(120deg,var(--card),color-mix(in_oklab,var(--card),var(--primary)_14%),var(--card))]",
        className,
      )}
    >
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          {eyebrow && (
            <span className="inline-block rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              {eyebrow}
            </span>
          )}
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {children && <div className="max-w-prose text-xs leading-relaxed text-muted-foreground">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SplitView — lista à esquerda (5 col), detalhe à direita (7 col). Empilha no
// mobile. Pra Caixa de Entrada e Data Hub.
// -----------------------------------------------------------------------------
export function SplitView({
  list,
  detail,
  className,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-12", className)}>
      <div className="lg:col-span-5">{list}</div>
      <div className="lg:col-span-7">{detail}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// RadarChart — polígono de N eixos (escala 0-100). `compare` sobrepõe um 2º
// polígono. Usado na ficha do jogador (radarScores em src/game/attributes.ts)
// e no dossiê de olheiro.
// -----------------------------------------------------------------------------
export function RadarChart({
  data,
  compare,
  aLabel = "A",
  bLabel = "B",
  className,
}: {
  data: { label: string; value: number }[];
  compare?: { label: string; value: number }[];
  aLabel?: string;
  bLabel?: string;
  className?: string;
}) {
  const n = data.length;
  const cx = 130;
  const cy = 128;
  const r = 78;
  const angle = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const pt = (value: number, i: number) => {
    const rad = (Math.max(0, Math.min(100, value)) / 100) * r;
    return [cx + rad * Math.cos(angle(i)), cy + rad * Math.sin(angle(i))] as const;
  };
  const poly = (vals: { value: number }[]) => vals.map((v, i) => pt(v.value, i).join(",")).join(" ");
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className={className}>
      <svg viewBox="0 0 260 256" className="w-full" role="img" aria-label={`Radar de atributos — ${aLabel}`}>
        {/* anéis */}
        {rings.map((k) => (
          <polygon
            key={k}
            points={Array.from({ length: n }, (_, i) => {
              const [x, y] = pt(k * 100, i);
              return `${x},${y}`;
            }).join(" ")}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}
        {/* eixos */}
        {data.map((_, i) => {
          const [x, y] = pt(100, i);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
        })}
        {/* polígono B (comparação) */}
        {compare && (
          <polygon points={poly(compare)} fill="var(--info)" fillOpacity="0.14" stroke="var(--info)" strokeWidth="2" />
        )}
        {/* polígono A */}
        <polygon points={poly(data)} fill="var(--primary)" fillOpacity="0.22" stroke="var(--primary)" strokeWidth="2" />
        {data.map((d, i) => {
          const [x, y] = pt(d.value, i);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="var(--primary)" />;
        })}
        {/* rótulos */}
        {data.map((d, i) => {
          const [lx, ly] = pt(118, i);
          const anchor = lx < cx - 6 ? "end" : lx > cx + 6 ? "start" : "middle";
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill="var(--muted-foreground)"
            >
              {d.label} <tspan fill="var(--foreground)">{d.value}</tspan>
            </text>
          );
        })}
      </svg>
      {compare && (
        <div className="mt-1 flex items-center justify-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 font-semibold text-primary">
            <span className="inline-block size-2.5 rounded-sm bg-primary" />
            {aLabel}
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-info">
            <span className="inline-block size-2.5 rounded-sm bg-info" />
            {bLabel}
          </span>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// ProsConsList — 2 colunas de bullets coloridos (verde/vermelho), estilo
// dossiê de olheiro do FM. Cada item já vem pronto ({label, text}) — a lógica
// de QUAIS destacar mora em quem chama (ex. playerScoutingNotes em
// src/game/attributes.ts, ou os arrays de analyzeOpponent).
// -----------------------------------------------------------------------------
export interface ProsConsItem {
  label: string;
  text: string;
}

export function ProsConsList({
  strengths,
  weaknesses,
  strengthsLabel = "Pontos fortes",
  weaknessesLabel = "Pontos fracos",
  /** false empilha as 2 colunas — pra caber num card estreito (sidebar). */
  twoColumns = true,
  className,
}: {
  strengths: ProsConsItem[];
  weaknesses: ProsConsItem[];
  strengthsLabel?: React.ReactNode;
  weaknessesLabel?: React.ReactNode;
  twoColumns?: boolean;
  className?: string;
}) {
  if (strengths.length === 0 && weaknesses.length === 0) return null;
  return (
    <div className={cn("grid gap-3", twoColumns && strengths.length > 0 && weaknesses.length > 0 && "sm:grid-cols-2", className)}>
      {strengths.length > 0 && (
        <div className="rounded-lg border border-ok/25 bg-ok/[0.06] p-3">
          <div className="fm-eyebrow mb-2 text-ok">{strengthsLabel}</div>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                <span>
                  <strong className="font-semibold text-foreground">{s.label}:</strong> {s.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3">
          <div className="fm-eyebrow mb-2 text-danger">{weaknessesLabel}</div>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            {weaknesses.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                <span>
                  <strong className="font-semibold text-foreground">{w.label}:</strong> {w.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// EmptyState — no lugar dos "Nenhum … ainda." soltos.
// -----------------------------------------------------------------------------
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background/40 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-6 text-muted-foreground/60" />}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="max-w-xs text-xs text-muted-foreground">{description}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
