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
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  documento: "Documento",
  recebido: "Recebido",
  em_analise: "Em análise documental",
  protocolado_inpi: "Protocolado no INPI",
  em_registro: "Na esteira blockchain",
  registrado: "Registrado em blockchain",
  certificado_emitido: "Certificado emitido",
  pendencia: "Pendência",
};

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
    case "indeferida":
      return "red";
    case "em_analise":
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
  {
    name: "Portal do INPI",
    url: "https://www.gov.br/inpi/pt-br",
    description: "Serviços, prazos e orientações oficiais de propriedade industrial.",
  },
  {
    name: "Polygonscan",
    url: "https://polygonscan.com/",
    description: "Explorador da blockchain Polygon para verificar transações e hashes.",
  },
  {
    name: "Biblioteca Nacional — Direitos Autorais",
    url: "https://www.gov.br/bn/pt-br/servicos/direitos-autorais",
    description: "Registro de obras literárias e autorais (EDA/BN).",
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
