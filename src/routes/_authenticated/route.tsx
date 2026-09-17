import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LOCAL_USER_ID } from "@/lib/desktop-mode";

// App 100% desktop, sem login — o único "usuário" já é o perfil local fixo.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    return { user: { id: LOCAL_USER_ID } };
  },
  component: () => <Outlet />,
});
