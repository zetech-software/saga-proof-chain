export const PRAZO_TEXTO = "7 a 25 dias úteis";

export const DOCUMENT_STATUSES = [
  "documento",
  "recebido",
  "em_analise",
  "protocolado_inpi",
  "em_registro",
  "registrado",
  "certificado_emitido",
  "pendencia",
  "aguardando_documentacao",
  "em_andamento",
  "concluido",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  documento: "Documento",
  recebido: "Documentos enviados",
  em_analise: "Em análise documental",
  protocolado_inpi: "Protocolado no INPI",
  em_registro: "Na esteira blockchain",
  registrado: "Registrado em blockchain",
  certificado_emitido: "Certificado emitido",
  pendencia: "Pendência",
  aguardando_documentacao: "Aguardando documentação",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

/**
 * Status agrupados por natureza. NÃO formam uma sequência única:
 * processo de envio, INPI e blockchain são trilhas distintas.
 */
export const DOCUMENT_STATUS_GROUPS: { label: string; statuses: string[] }[] = [
  {
    label: "Processo de envio",
    statuses: ["recebido", "em_analise", "aguardando_documentacao", "em_andamento", "concluido"],
  },
  { label: "INPI", statuses: ["protocolado_inpi"] },
  { label: "Blockchain", statuses: ["em_registro", "registrado", "certificado_emitido"] },
  { label: "Informativo", statuses: ["documento", "pendencia"] },
];

export const TRADEMARK_STATUSES = [
  "submetida",
  "em_analise",
  "protocolada",
  "publicada",
  "deferida",
  "indeferida",
] as const;

export const TRADEMARK_STATUS_LABEL: Record<string, string> = {
  submetida: "Submetida",
  em_analise: "Em análise",
  protocolada: "Protocolada no INPI",
  publicada: "Publicada na RPI",
  deferida: "Deferida",
  indeferida: "Indeferida",
};

export const SUPPORT_STATUSES = ["aberta", "respondida", "fechada"] as const;

export const SUPPORT_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  respondida: "Respondida",
  fechada: "Fechada",
};

export function statusTone(status: string): "gold" | "violet" | "green" | "red" | "muted" {
  switch (status) {
    case "registrado":
    case "certificado_emitido":
    case "concluido":
    case "deferida":
    case "respondida":
      return "green";
    case "aberta":
      return "gold";
    case "em_registro":
    case "protocolado_inpi":
    case "protocolada":
    case "publicada":
      return "violet";
    case "pendencia":
    case "aguardando_documentacao":
    case "indeferida":
      return "red";
    case "em_analise":
    case "em_andamento":
      return "gold";
    default:
      return "muted";
  }
}

export const OFFICIAL_LINKS = [
  {
    name: "Busca de marcas — INPI",
    url: "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp",
    description: "Consulta pública de pedidos e registros de marca no INPI.",
  },
  {
    name: "Revista da Propriedade Industrial (RPI)",
    url: "https://revistas.inpi.gov.br/rpi/",
    description: "Publicações oficiais semanais sobre andamento dos processos.",
  },
];

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// ---- Prazo estimado (dias úteis seg–sex, fuso America/Sao_Paulo; feriados nacionais + estadual SP considerados) ----
export const PRAZO_MIN_DIAS_UTEIS = 7;
export const PRAZO_MAX_DIAS_UTEIS = 25;

function spCalendarDate(iso: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return new Date(Date.UTC(+dateOnly[1]!, +dateOnly[2]! - 1, +dateOnly[3]!));
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y = 0, m = 1, day = 1] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// Feriados fixos: nacionais (Lei 662/1949, 6.802/1980, 14.759/2023) + estadual SP (09/07, Lei 9.497/1997).
const FIXED_HOLIDAYS = [
  "01-01",
  "04-21",
  "05-01",
  "07-09",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
];
const holidayCache = new Map<number, Set<string>>();

function holidaysOf(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(FIXED_HOLIDAYS.map((md) => `${year}-${md}`));
    // Sexta-feira Santa (feriado nacional móvel): Páscoa − 2 dias.
    const goodFriday = easterSunday(year);
    goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
    set.add(goodFriday.toISOString().slice(0, 10));
    holidayCache.set(year, set);
  }
  return set;
}

/** Dia útil: segunda a sexta, exceto feriados nacionais e estaduais de SP. */
export function isBusinessDay(d: Date): boolean {
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !holidaysOf(d.getUTCFullYear()).has(d.toISOString().slice(0, 10));
}

function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

/** Retorna null quando não há data confiável. */
export function estimateBusinessWindow(startIso: string | null | undefined) {
  if (!startIso) return null;
  const start = spCalendarDate(startIso);
  if (!start) return null;
  const fmt = (x: Date) =>
    x.toLocaleDateString("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return {
    min: fmt(addBusinessDays(start, PRAZO_MIN_DIAS_UTEIS)),
    max: fmt(addBusinessDays(start, PRAZO_MAX_DIAS_UTEIS)),
  };
}

/** Data de início confiável: data confirmada por admin ou o envio registrado pelo próprio cliente. */
export function reliableProcessStart(doc: {
  process_started_at?: string | null;
  submitted_at?: string | null;
  sentByClient: boolean;
}): string | null {
  if (doc.process_started_at) return doc.process_started_at;
  if (doc.sentByClient && doc.submitted_at) return doc.submitted_at;
  return null;
}

export function formatDateOnly(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
