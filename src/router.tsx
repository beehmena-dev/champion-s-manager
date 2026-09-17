import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // staleTime padrão do React Query é 0 — toda vez que uma tela é
  // remontada (ex. navegar pra um clube, voltar, clicar em outro), TODAS as
  // queries dela refazem do zero, mesmo que o dado tenha acabado de ser
  // buscado segundos atrás. Isso soma com o banco de dev (PGlite/WASM,
  // single-threaded) engasgando sob muita consulta concorrente — cada
  // clique dispara uma nova rajada de ~8-10 requisições em paralelo. 5s de
  // staleTime corta bastante esse "clicar rápido de novo refaz tudo" sem
  // risco de mostrar dado desatualizado — qualquer ação de jogo real já
  // chama qc.invalidateQueries() explicitamente (ver saves.$saveId.tsx),
  // que ignora staleTime e força atualização na hora.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
