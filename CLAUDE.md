# TáticaFC / FootyManager

Jogo de gerenciamento de futebol estilo Football Manager, interface 100% em português (Brasil), construído pra ser um produto real (não um projeto pequeno/hobby) — meta declarada do usuário é "muita gente jogar isso".

## Antes de tudo: leia a memória

Este projeto usa o sistema de memória automática do Claude Code, guardado em:

```
C:\Users\sistemas4\.claude\projects\C--Users-sistemas4-Documents-Projetos-FootyManager\memory\
```

Comece SEMPRE por `MEMORY.md` nessa pasta (índice) e siga os links pros arquivos `project_*.md`/`feedback_*.md` relevantes ao que for mexer. Eles têm o histórico detalhado, verificado, de cada feature grande — muito mais completo que este arquivo. Este CLAUDE.md é o resumo de orientação rápida; a memória é a fonte de verdade sobre o que já foi feito e por quê. Se essa pasta não estiver acessível na sua sessão, os arquivos são markdown puro — dá pra ler direto com qualquer ferramenta de leitura de arquivo.

## Stack

- **App 100% desktop Windows (Tauri)** — não existe mais versão web nem dependência da Lovable (removida de vez em 13/09/2026, ver `project_desktop_windows_offline.md` e `project_no_lovable_migration.md` na memória). Não recriar `@lovable.dev/*`, `nitro`/Cloudflare, nem tela de login — foram removidos de propósito.
- **TanStack Start** (React 19, rotas por arquivo em `src/routes/`, sempre buildado em modo SPA estático — `spa: { enabled: true }` no `vite.config.ts`) + **TanStack Router** + **TanStack Query**
- Backend: **Postgres nativo + PostgREST reais** (trocado do PGlite/WASM em 14/09/2026 — travava sob carga, ver `project_desktop_windows_offline.md`), ambos embutidos no app via sidecar do Tauri (`src-tauri/src/lib.rs` sobe os dois sozinho quando o app abre, `node` rodando `local-db-server.mjs` + `postgrest` nativo). Sem login — cada save é um perfil local (`src/lib/desktop-mode.ts`). O client (`src/integrations/supabase/client.ts`) usa `@supabase/supabase-js` só como client HTTP genérico de PostgREST, apontado por padrão pra `http://127.0.0.1:3111` — não tem nuvem nenhuma envolvida.
- **Tailwind v4** + **shadcn/radix** (`src/components/ui/*`) pra primitivas, **`src/components/fm.tsx`** é o kit de UI PRÓPRIO do app (PageHeader, MetricCard, StatBar, MeterBar, Pill, SubTabs, HeroBanner, SplitView, EmptyState, RatingBadge, ProsConsList, SubViewDropdown) — **sempre construir telas novas com esse kit**, nunca estilizar na mão do zero.
- **Three.js** pro motor 3D da partida (`match-3d-pitch.tsx`)
- **Vitest** pra testes (`src/game/__tests__/`)
- Dev (navegador, iteração rápida): `npm run dev:backend` num terminal (sobe PGlite+PostgREST locais, deixa aberto) + `npm run dev` (vite) em outro. Porta do vite configurada em `.claude/launch.json` como "footymanager-dev", autoPort ligado porque 3000/8080 costumam estar ocupadas.
- App de verdade: `npm run build` (ou `build:desktop`, mesma coisa) + `npx tauri build` (dentro de `src-tauri/`, precisa `export PATH="$USERPROFILE/.cargo/bin:$PATH"` antes se o Rust não estiver no PATH da sessão). **Nunca testar visualmente com `cargo build --release` sozinho** — pula as env vars de produção que só a CLI do Tauri define, e o app tenta carregar `devUrl` (localhost:3000) em vez do bundle real.

## Como o usuário trabalha comigo

- Fluxo padrão: "segue, faz X" — autoriza implementar uma feature específica de ponta a ponta (código + migration se precisar + testes + verificação ao vivo) sem precisar confirmar cada passo.
- Prefere que eu pesquise/verifique DIRETO (ler código, grep, banco) em vez de assumir ou usar subagentes pra tarefas de "achar o próximo gap" — ver `feedback_no_subagents_for_gap_search.md`.
- Valoriza honestidade explícita sobre limitações de escopo (ex.: "nosso motor tem 5-6 dials reais, a FM de verdade tem ~20 — reorganizamos os mesmos dials na estrutura visual deles em vez de fabricar toggles falsos"). Sempre comunicar esse tipo de trade-off, não esconder.
- Pede pra verificar AO VIVO (banco de produção real + navegador) sempre que der, não só testes unitários — e quer saber quando algo NÃO foi verificado ao vivo e por quê.
- Já corrigiu identificações erradas de referência visual mais de uma vez (ver seção FM21 Touch abaixo) — sempre confirmar o NOME EXATO da tela/câmera antes de replicar algo de um vídeo de referência.

## Referência visual: FM21 Touch (não o protótipo AI Studio)

A partir da Fase 7 do roadmap, **FM21 Touch é o norte visual definitivo** pra qualquer trabalho novo de 2D/3D/telas — substituiu o protótipo antigo (`manager-football-main.zip`, AI Studio) que só serviu de referência nas Fases 2/6.

Pontos importantes já aprendidos (não repetir os erros):
- O motor de partida real do FM **NÃO é simulação espacial contínua tick-a-tick**. É geração instantânea do resultado inteiro via sequência de números aleatórios ponderados (confirmado por pesquisa de vídeo citando Ov Collyer/SI) — o que se assiste é uma encenação/replay dessa sequência já decidida. Isso validou a arquitetura já usada aqui: `simulation.ts` decide eventos discretos por minuto via RNG ponderado seedado; `live-positions.ts` é a camada 100% visual/decorativa que desenha o resultado. **Não reescrever como simulação espacial** — já foi decidido e confirmado com o usuário duas vezes (ver `project_match_engine_ifab.md` e `project_match_engine_granular.md`).
- Um vídeo de referência pode ter VÁRIAS câmeras/modos com nomes específicos (Director, TV, Sideline, Behind Goal, Vertical Scrolling, Data Analyst, **2D Classic**). Já errei identificando qual tela era qual mais de uma vez. **Sempre confirmar o nome exato** antes de copiar visual.
- O "2D Classic" de verdade é **PAISAGEM** (não retrato), com moldura pílula roxa (arquibancada desfocada) + anel marrom-terracota (pista) + grama em círculos concêntricos, fichas preenchidas na cor primária do clube com número dentro e anel na cor secundária, nome do jogador só aparece quando destacado (gol/cartão/lesão), não permanentemente.
- Interface interna do FM (skins) é um sistema proprietário fechado em XML (`container`/`widget`/`layout` tags, pastas `classes/graphics/panels/settings`) — **não é algo que dá pra importar/reaproveitar tecnicamente**, é só referência conceitual de como organizar layout declarativo. O que já fazemos (padrões de UX/interação replicados em React/Tailwind) é o caminho certo — nunca copiar assets visuais exatos (marca, logo, paleta identificável).
- Ativos visuais sem licença (brasão, kit, rosto de jogador): fallback procedural sempre existe (nunca quebra pra quem não tiver asset real), mas **não bloquear/questionar repetidamente quando o usuário decidir usar asset real de terceiro** (escudo, foto) — decisão de risco dele, dado 15/09/2026 (ver `feedback_dont_block_on_ip_concerns.md`). Mencionar a consideração no máximo uma vez se for relevante; depois disso, só executar.

## Arquitetura do motor de jogo

- `src/game/*.ts` — lógica pura do motor (sem I/O): `simulation.ts` (núcleo — sorteio ponderado por minuto), `tactics.ts` (rating tático, presets, templates de estilo), `roles.ts` (38 famílias de função real-FM × atribuições), `player-instructions.ts` (9 campos -1/0/+1), `texture.ts` (micro-eventos cosméticos), `live-positions.ts` (camada visual 2D/3D, decorativa, nunca influencia placar), `offside.ts`, `goalkeeper-rules.ts`, `match-context.ts` (árbitro/clima), `set-pieces.ts`, `congestion.ts`, `highlights.ts` (motor de "melhores momentos" compartilhado 2D/3D), `attributes.ts`, `promotion.ts`, `calendar-events.ts`, etc. Toda regra nova do motor ganha teste em `src/game/__tests__/` (convenção explícita do usuário).
- `src/lib/*.ts` — orquestração que toca Supabase: `advance-day.ts` (avança N dias, processa partidas/temporada/scouting/etc.), `live-match.ts` (partida ao vivo do usuário, com checkpoints de pausa tática), `cup-progression.ts`, `season-rollover.ts`, `inbox.ts`, `board.ts`, `calendar.ts`.
- `src/routes/_authenticated/saves.$saveId.*.tsx` — telas (uma por rota: tactics, squad, calendar, analysis, medical, academy, staff, market, news, board, finances, table, cup, career, players.$playerId).
- Visualização de partida: `match-pitch.tsx` (2D), `match-3d-pitch.tsx` (3D, Three.js), `match-viewer.tsx` (envelope 2D/3D + integração), `src/hooks/use-highlight-playback.ts` (motor de checkpoint/highlight compartilhado pelos dois).

## Processo de migration/SQL (banco local, sem nuvem)

Não existe mais banco de produção na nuvem (Lovable/Supabase removidos de vez) — cada usuário tem seu próprio banco local (PGlite) dentro do app. Migrations vivem em `supabase/migrations/*.sql` (nome mantido por histórico, não tem nada de Supabase Cloud nisso) e são aplicadas automaticamente por `scripts/local-db-server.mjs` na primeira vez que o banco local abre.

- **Cuidado real**: `ensureSchema()` em `local-db-server.mjs` só roda as migrations se a tabela `saves` ainda não existir — ou seja, um banco local que já tem um save NÃO reaplica migrations novas sozinho. Ainda não existe um mecanismo de "migração incremental" pra bancos locais já existentes — ao adicionar uma migration nova durante o desenvolvimento, apagar `.local-db-data/` (dev) ou o `db/` dentro do `app_data_dir` do Tauri pra recriar do zero, OU escrever a migration de um jeito que também rode como `ALTER` idempotente em cima de um banco já existente (registrar isso na memória se virar problema recorrente).
- `src/integrations/supabase/types.ts` (tipos gerados, convenção antiga da Lovable) não é mais regenerado por ferramenta nenhuma — o padrão de usar `as any` em colunas novas continua valendo até alguém regenerar esse arquivo na mão contra o schema local.
- Testar uma migration nova: `node scripts/local-db-server.mjs` isolado, ou `npm run dev:backend` completo (banco + PostgREST) — ver seção Stack.

## Testes e verificação

- `npx vitest run` — suíte cresce a cada feature nova (passou de 84 testes na sessão mais recente registrada). `npx tsc --noEmit` sempre deve ficar limpo antes de considerar algo terminado.
- Verificação ao vivo é valorizada acima de só testes unitários: usar o Browser pane, navegar pro save real, inspecionar `get_page_text`/`read_page`/`javascript_tool` (fiber React pra puxar estado interno — técnica: `el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))]`, subir `.return`/andar `.child`/`.sibling` procurando o componente certo por `f.type.name`, ler hook state ou `memoizedProps`), e checar o banco direto via `supabase db query`.
- `screenshot` pode dar timeout se a janela do Claude estiver minimizada/oculta — nesse caso usar `get_page_text`/`read_page`/`javascript_tool` (funcionam independente de visibilidade da janela).
- **Nunca navegar/recarregar a aba do navegador enquanto uma chamada `javascript_tool` de longa duração (ex. `advanceDays` de muitos dias) ainda pode estar em voo** — o timeout do tool é só do lado do Claude, a Promise real continua rodando no browser; navegar mata a execução no meio e pode deixar o banco em estado parcial (ex. `game_date` avançado mas partidas intermediárias não processadas). Ver `feedback_js_tool_long_calls.md`.

## Estado do roadmap (resumo — ver `project_visual_overhaul.md` pra detalhe completo)

- **Fases 1-3** (kit visual + telas + features: inbox, número de camisa, vestiário, análise de adversário, gritos de campo, pedidos à diretoria) — **completas**.
- **Fase 4** (mobile/Capacitor/offline) — planejada, nada feito ainda.
- **Fase 5** (paridade mecânica: ligas jogáveis×2º plano, promoção/rebaixamento, preleção, bola parada, congestionamento de calendário) — **completa**.
- **Fase 6** (motor 3D nível FM Touch: torcida, pós-processamento, performance, jogadores procedurais, estádio, animações, som, broadcast) — **completa**.
- **Fase 7** (identidade visual FM21 Touch) — em andamento. Feito: tela de táticas reformada (popup de troca/função/instruções, bonecos-camisa, mini-diagrama de função, templates de estilo, badges/prós-contras consistentes, elenco do dia de jogo, dropdown de sub-view, animação de avanço de dia, **tela de calendário em grade** (grid mês/semana com eventos por dia), **tela de táticas "exatamente igual à FM"** (toggles por fase Em Posse/Transição/Sem a Bola, Team Fluidity com efeito real, override "só a próxima partida"), **campo 2D no visual certo do FM21 Touch** (paisagem, confirmado por vídeo dedicado). Pendente/registrado: dashboard multi-painel de "tempo morto" entre lances, ticker de comentário contínuo, configurações de câmera/velocidade expostas na UI, brasão/kit/rosto procedural com upload custom, e vários achados menores catalogados na memória (mentoria, scouting avançado, empréstimos com sparkline, lance como lance próprio, etc.) ainda sem tarefa formal.
- **Motor de partida** (Blocos IFAB + granularidade): árbitro/clima/acréscimo dinâmico/impedimento/regras de goleiro, prorrogação+VAR no mata-mata, e micro-eventos de textura (pressão/marcação/corrida de apoio/chute de fora/drible) conectados a instrução de jogador e diagrama de função real — tudo **completo e testado**.
- **App desktop Windows sem Lovable** (Tauri + PGlite + PostgREST local, sem login) — **completo**: sidecars sobem sozinhos, DLLs do Postgres baixadas via script automatizado, dependência da Lovable removida de vez do código (auth, build config, client gerado). Ver `project_desktop_windows_offline.md` e `project_no_lovable_migration.md`.

## Import de base de dados real

O usuário importa a própria base FM24 (extraída via FM Genie Scout, uso legal próprio) — `scripts/fm-csv-to-seed.mjs` converte pro formato de seed do jogo. Cuidado: o EULA do Genie Scout proíbe export em massa de atributos individuais, então os 47 atributos são DERIVADOS das 16 notas por posição do CSV (aproximação aceita pelo usuário), não copiados 1:1. Nunca fazer scraping de fminside.net (robots.txt bloqueia) nem tentar contornar a limitação do Genie Scout. Ver `project_fm_database_import.md` pro processo completo de reimport.
