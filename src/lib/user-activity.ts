export type UserActivity = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  roles: string[] | null;
  created_at: string;
  last_sign_in_at: string | null;
};

export const ACCESS_FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "hoje", label: "Acessaram hoje" },
  { id: "7", label: "Últimos 7 dias" },
  { id: "15", label: "Últimos 15 dias" },
  { id: "30", label: "Últimos 30 dias" },
  { id: "inativos", label: "Mais de 30 dias sem acessar" },
  { id: "nunca", label: "Nunca acessaram" },
] as const;

export type AccessFilterId = (typeof ACCESS_FILTERS)[number]["id"];

const TZ = "America/Sao_Paulo";

export function formatSpDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSpDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Dia civil (America/Sao_Paulo) em formato AAAA-MM-DD. */
function spCivilDay(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayIndex(date: Date) {
  const [y, m, d] = spCivilDay(date).split("-").map(Number);
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** Dias civis completos entre o último acesso e hoje (0 = hoje). null se nunca acessou. */
export function daysSinceAccess(lastSignInAt: string | null | undefined, now = new Date()) {
  if (!lastSignInAt) return null;
  const date = new Date(lastSignInAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, dayIndex(now) - dayIndex(date));
}

export function describeDaysSince(days: number | null) {
  if (days === null) return "Nunca acessou";
  if (days === 0) return "Hoje";
  if (days === 1) return "Há 1 dia";
  return `Há ${days} dias`;
}

export function matchesAccessFilter(days: number | null, filter: AccessFilterId) {
  switch (filter) {
    case "todos":
      return true;
    case "nunca":
      return days === null;
    case "hoje":
      return days === 0;
    case "7":
      return days !== null && days <= 7;
    case "15":
      return days !== null && days <= 15;
    case "30":
      return days !== null && days <= 30;
    case "inativos":
      return days !== null && days > 30;
    default:
      return true;
  }
}

export function roleLabel(roles: string[] | null | undefined) {
  const list = roles ?? [];
  if (list.includes("admin")) return "Administrador";
  if (list.includes("cliente")) return "Cliente";
  return "Sem cargo";
}
