// Preferência de tema — nível de app (device), não por save. Persistida em
// localStorage porque é sobre COMO a interface aparece pra essa pessoa nessa
// máquina, não sobre o estado do jogo em si (não faz sentido o tema mudar
// save a save). A classe .dark já existe inteira em src/styles.css (padrão
// shadcn) — só nunca tinha sido ligada a nada.
export type Theme = "light" | "dark";

const KEY = "taticafc-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
