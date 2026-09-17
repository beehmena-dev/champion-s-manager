import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensureLocalSession } from "@/lib/auto-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Sem tela de login: o perfil local é criado/reaberto automaticamente.
  beforeLoad: async () => {
    const id = await ensureLocalSession();
    return { user: { id } };
  },
  component: () => <Outlet />,
});
