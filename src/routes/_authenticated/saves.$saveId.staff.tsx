import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/game-hooks";
import { ensureCandidatePool, hireStaff, fireStaff } from "@/lib/staff";
import { STAFF_ROLES, STAFF_ROLE_LABELS, STAFF_ROLE_DESCRIPTIONS, type StaffRole } from "@/game/staff";
import {
  WEEKLY_FOCUS_OPTIONS, WEEKLY_FOCUS_LABELS, WEEKDAY_LABELS, TRAINING_FOCUS_OPTIONS,
  type TrainingFocus, type WeeklyFocus,
} from "@/game/training";
import { PageHeader } from "@/components/fm";
import { Briefcase } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/saves/$saveId/staff")({
  component: StaffPage,
});

interface TrainingRoutine { id: string; name: string; days: WeeklyFocus[] }

// Foco "representativo" da grade pra manter clubs.training_focus com algo
// sensato — é o único leitor externo desse campo hoje (dashboard/análise
// não leem, só o motor via resolveWeeklyFocus, que já prioriza a grade
// semanal e só cai pro flat quando ela não existe).
function modeFocus(days: WeeklyFocus[]): TrainingFocus {
  const counts = new Map<TrainingFocus, number>();
  for (const d of days) {
    if (d === "rest") continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: TrainingFocus = "balanced";
  let bestN = -1;
  for (const f of TRAINING_FOCUS_OPTIONS) {
    const n = counts.get(f) ?? 0;
    if (n > bestN) { best = f; bestN = n; }
  }
  return best;
}

function StaffPage() {
  const { saveId } = useParams({ from: "/_authenticated/saves/$saveId/staff" });
  const qc = useQueryClient();
  const [weekly, setWeekly] = useState<WeeklyFocus[] | null>(null);
  const [newRoutineOpen, setNewRoutineOpen] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");

  const save = useQuery({
    queryKey: ["save", saveId],
    queryFn: async () => (await supabase.from("saves").select("*").eq("id", saveId).single()).data,
  });
  const myClubId = save.data?.my_club_id;
  const today = save.data?.game_date;

  const club = useQuery({
    queryKey: ["club-training", myClubId],
    enabled: !!myClubId,
    queryFn: async () =>
      (await supabase.from("clubs").select("training_focus, weekly_training, training_routines").eq("id", myClubId!).single() as any).data,
  });
  // Carrega a grade salva (ou preenche as 7 posições com o foco fixo antigo,
  // pra quem nunca abriu esta tela) só uma vez, na primeira carga.
  useEffect(() => {
    if (!club.data || weekly !== null) return;
    const stored = club.data.weekly_training as WeeklyFocus[] | null;
    if (stored && stored.length === 7) setWeekly(stored);
    else setWeekly(Array(7).fill((club.data.training_focus as TrainingFocus) ?? "balanced"));
  }, [club.data, weekly]);

  const routines: TrainingRoutine[] = (club.data?.training_routines as TrainingRoutine[]) ?? [];

  const pool = useQuery({
    queryKey: ["staff", saveId, myClubId],
    enabled: !!myClubId,
    queryFn: async () => {
      await ensureCandidatePool(saveId);
      const { data, error } = await supabase.from("staff").select("*").eq("save_id", saveId).or(`club_id.eq.${myClubId},club_id.is.null`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hire = useMutation({
    mutationFn: (vars: { staffId: string; role: StaffRole }) => hireStaff(saveId, myClubId!, vars.staffId, vars.role, today!),
    onSuccess: () => { toast.success("Contratado."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });
  const fire = useMutation({
    mutationFn: (staffId: string) => fireStaff(staffId),
    onSuccess: () => { toast.info("Demitido."); qc.invalidateQueries(); },
  });

  const saveWeekly = useMutation({
    mutationFn: async () => {
      if (!weekly) return;
      const { error } = await supabase.from("clubs")
        .update({ weekly_training: weekly, training_focus: modeFocus(weekly) } as any)
        .eq("id", myClubId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Grade de treino salva."); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const saveRoutines = useMutation({
    mutationFn: async (next: TrainingRoutine[]) => {
      const { error } = await supabase.from("clubs").update({ training_routines: next } as any).eq("id", myClubId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-training", myClubId] }),
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  function saveCurrentAsRoutine(name: string) {
    if (!weekly) return;
    const routine: TrainingRoutine = { id: `${Date.now()}`, name: name.trim() || `Rotina ${routines.length + 1}`, days: weekly };
    saveRoutines.mutate([...routines, routine]);
  }
  function loadRoutine(r: TrainingRoutine) {
    setWeekly(r.days);
  }
  function deleteRoutine(id: string) {
    saveRoutines.mutate(routines.filter((r) => r.id !== id));
  }

  const mine = (role: StaffRole) => (pool.data ?? []).find((s) => s.club_id === myClubId && s.role === role);
  const candidatesFor = (role: StaffRole) => (pool.data ?? []).filter((s) => s.club_id === null && s.role === role);

  return (
    <div className="space-y-4">
      <PageHeader icon={Briefcase} title="Comissão técnica" subtitle="Contrate auxiliares e defina a grade semanal de treino do time." />
      <div className="grid md:grid-cols-3 gap-4">
        {STAFF_ROLES.map((role) => {
          const hired = mine(role);
          return (
            <Card key={role} className="p-4">
              <div className="font-semibold">{STAFF_ROLE_LABELS[role]}</div>
              <p className="text-xs text-muted-foreground mb-3">{STAFF_ROLE_DESCRIPTIONS[role]}</p>
              {hired ? (
                <div className="space-y-2">
                  <div className="font-medium">{hired.name}</div>
                  <div className="text-sm text-muted-foreground">Nota {hired.skill}/20 · {formatMoney(hired.wage)}/quinzena</div>
                  <Button size="sm" variant="destructive" onClick={() => fire.mutate(hired.id)} disabled={fire.isPending}>
                    Demitir
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidatesFor(role).map((c) => (
                    <div key={c.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">Nota {c.skill}/20 · {formatMoney(c.wage)}/quinzena</div>
                      </div>
                      <Button size="sm" onClick={() => hire.mutate({ staffId: c.id, role })} disabled={hire.isPending}>
                        Contratar
                      </Button>
                    </div>
                  ))}
                  {candidatesFor(role).length === 0 && <div className="text-sm text-muted-foreground">Nenhum candidato disponível.</div>}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <div className="fm-eyebrow mb-1.5">Rotinas salvas</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {routines.map((r, i) => (
              <div key={r.id} className="group relative">
                <button
                  type="button"
                  onClick={() => loadRoutine(r)}
                  title={r.name}
                  className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => deleteRoutine(r.id)}
                  title={`Remover "${r.name}"`}
                  className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
            {newRoutineOpen ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  className="h-7 w-32 text-xs"
                  placeholder={`Rotina ${routines.length + 1}`}
                  value={newRoutineName}
                  onChange={(e) => setNewRoutineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { saveCurrentAsRoutine(newRoutineName); setNewRoutineOpen(false); }
                    if (e.key === "Escape") setNewRoutineOpen(false);
                  }}
                />
                <Button size="sm" className="h-7" onClick={() => { saveCurrentAsRoutine(newRoutineName); setNewRoutineOpen(false); }}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setNewRoutineName(""); setNewRoutineOpen(true); }}
                title="Salvar grade atual como nova rotina"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                +
              </button>
            )}
          </div>
          {routines.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Clique num número pra carregar a rotina na grade abaixo — "Salvar" é que aplica de verdade.
            </p>
          )}
        </div>

        <div>
          <div className="fm-eyebrow mb-2">Grade semanal de treino</div>
          <p className="text-xs text-muted-foreground mb-3">
            Dias de foco aceleram o desenvolvimento dos atributos daquele foco, com risco de lesão de treino. Dias de
            descanso não treinam nada, mas recuperam mais condição e não têm risco de lesão — o trade-off entre
            desenvolvimento e elenco fresco é seu.
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="space-y-1">
                <div className="text-center text-[10px] font-semibold text-muted-foreground">{label}</div>
                <select
                  className="h-8 w-full rounded border bg-background px-1 text-[11px]"
                  value={weekly?.[i] ?? "balanced"}
                  onChange={(e) => {
                    const next = [...(weekly ?? Array(7).fill("balanced"))] as WeeklyFocus[];
                    next[i] = e.target.value as WeeklyFocus;
                    setWeekly(next);
                  }}
                >
                  {WEEKLY_FOCUS_OPTIONS.map((f) => (
                    <option key={f} value={f}>{WEEKLY_FOCUS_LABELS[f]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button className="mt-3" size="sm" onClick={() => saveWeekly.mutate()} disabled={saveWeekly.isPending || !weekly}>
            Salvar
          </Button>
        </div>
      </Card>
    </div>
  );
}
