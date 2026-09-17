// App 100% desktop (Tauri + PGlite local) — sem versão web, sem login de
// verdade. Ver project_desktop_windows_offline.md na memória do projeto
// pra arquitetura completa.

// Mesmo UUID fake criado pelo shim de auth.uid() em scripts/local-db-server.mjs.
// A coluna saves.user_id já tem DEFAULT pra esse valor no banco local (ver
// DESKTOP_PATCH no mesmo script), mas mandamos explícito aqui também pra o
// código ficar claro sobre o que está acontecendo.
export const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001";

// "Usuário atual" nesse app é sempre o perfil local único — não existe
// sessão/login pra consultar.
export async function getCurrentUserId(): Promise<string> {
  return LOCAL_USER_ID;
}
