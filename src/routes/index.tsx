import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    // App 100% desktop, sem login — direto pro dashboard (perfil local único).
    navigate({ to: "/dashboard", replace: true });
  }, [navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground">Carregando…</div>
    </div>
  );
}
