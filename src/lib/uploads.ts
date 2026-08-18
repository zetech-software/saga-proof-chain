// Validação centralizada de uploads do portal (cliente).
// IMPORTANTE: esta validação melhora segurança e experiência, mas NÃO substitui
// validação no servidor/Storage. Ver nota em UPLOAD_SERVER_VALIDATION_NOTE.

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "50 MB";

export const UPLOAD_SERVER_VALIDATION_NOTE =
  "Validação equivalente no backend/Storage não existe hoje: exigiria política de Storage ou função no servidor.";

type AllowedType = {
  /** extensão sem ponto */
  ext: string;
  /** content-type canônico usado no upload */
  contentType: string;
  /** MIMEs aceitos vindos do navegador */
  mimes: string[];
};

const ALLOWED_TYPES: AllowedType[] = [
  { ext: "pdf", contentType: "application/pdf", mimes: ["application/pdf"] },
  {
    ext: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  { ext: "jpg", contentType: "image/jpeg", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  { ext: "jpeg", contentType: "image/jpeg", mimes: ["image/jpeg", "image/jpg", "image/pjpeg"] },
  { ext: "png", contentType: "image/png", mimes: ["image/png", "image/x-png"] },
  { ext: "webp", contentType: "image/webp", mimes: ["image/webp"] },
  {
    ext: "zip",
    contentType: "application/zip",
    mimes: [
      // variantes legítimas devolvidas por navegadores/SOs diferentes
      "application/zip",
      "application/x-zip",
      "application/x-zip-compressed",
      "application/zip-compressed",
      "multipart/x-zip",
    ],
  },
];

/** MIMEs vazios/genéricos: tratados de forma conservadora (aceitos só se a extensão for permitida). */
const GENERIC_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

/** Extensões perigosas — bloqueadas em qualquer posição do nome (extensão dupla). */
const DANGEROUS_EXTS = new Set([
  "html", "htm", "xhtml", "phtml", "shtml", "svg", "svgz", "xml", "js", "mjs", "cjs", "jsx",
  "php", "php3", "php5", "asp", "aspx", "jsp", "exe", "com", "scr", "pif", "msi", "bat", "cmd",
  "sh", "bash", "ps1", "vbs", "vbe", "wsf", "hta", "jar", "apk", "app", "dll", "so", "dylib",
  "bin", "reg", "lnk", "iso", "dmg", "deb", "rpm", "py", "rb", "pl",
]);

export const ACCEPT_ATTRIBUTE =
  ".pdf,.docx,.jpg,.jpeg,.png,.webp,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,application/zip";

export const ALLOWED_FORMATS_LABEL = "PDF, DOCX, JPG, JPEG, PNG, WEBP ou ZIP";

export const UPLOAD_HELP_TEXT = `Formatos aceitos: ${ALLOWED_FORMATS_LABEL}. Tamanho máximo: ${MAX_UPLOAD_LABEL}.`;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

/** Remove diretórios, caracteres de controle e sequências perigosas do nome. */
export function sanitizeFileName(rawName: string): string {
  const withoutDirs = rawName.split(/[\\/]/).pop() ?? "";
  return withoutDirs
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/[^\w.\- ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
}

function extensionsOf(name: string): string[] {
  return name.split(".").slice(1).map(normalize).filter(Boolean);
}

export type UploadValidation =
  | { ok: true; file: File; contentType: string; storageName: string; displayName: string }
  | { ok: false; message: string };

export function validateUploadFile(file: File | null | undefined): UploadValidation {
  if (!file) return { ok: false, message: `Selecione um arquivo. ${UPLOAD_HELP_TEXT}` };

  const sanitized = sanitizeFileName(file.name);
  const parts = sanitized.split(".");
  if (parts.length < 2 || !parts[0]) {
    return {
      ok: false,
      message: "Nome de arquivo inválido. Renomeie o arquivo e tente novamente.",
    };
  }

  const exts = extensionsOf(sanitized);
  const finalExt = exts[exts.length - 1] ?? "";

  if (exts.some((e) => DANGEROUS_EXTS.has(e))) {
    return {
      ok: false,
      message: `Arquivo bloqueado por segurança (extensão não permitida ou extensão dupla suspeita). ${UPLOAD_HELP_TEXT}`,
    };
  }

  const allowed = ALLOWED_TYPES.find((t) => t.ext === finalExt);
  if (!allowed) {
    return { ok: false, message: `Formato não permitido. ${UPLOAD_HELP_TEXT}` };
  }

  // Extensão dupla: só aceitamos uma extensão real no final.
  if (exts.length > 1) {
    const previous = exts[exts.length - 2]!;
    const looksLikeExtension = /^[a-z0-9]{2,5}$/.test(previous);
    const knownExtension =
      ALLOWED_TYPES.some((t) => t.ext === previous) || DANGEROUS_EXTS.has(previous);
    if (looksLikeExtension && knownExtension) {
      return {
        ok: false,
        message: `Arquivo com extensão dupla suspeita (${sanitized}). Renomeie e tente novamente.`,
      };
    }
  }

  const mime = normalize(file.type ?? "");
  const mimeOk = allowed.mimes.includes(mime) || GENERIC_MIMES.has(mime);
  if (!mimeOk) {
    return {
      ok: false,
      message: `O conteúdo do arquivo (${file.type || "desconhecido"}) não corresponde à extensão .${finalExt}. ${UPLOAD_HELP_TEXT}`,
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `Arquivo maior que ${MAX_UPLOAD_LABEL}. Reduza o tamanho ou envie compactado em ZIP.`,
    };
  }

  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    ok: true,
    file,
    contentType: allowed.contentType,
    storageName: `${uniqueId}.${finalExt}`,
    displayName: file.name.slice(0, 160),
  };
}

/** Mensagens específicas e sem detalhes internos para falhas de upload. */
export function describeUploadError(error: unknown): string {
  if (error instanceof Error) {
    const raw = error.message ?? "";
    const message = raw.toLowerCase();
    if (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("network request failed") ||
      message.includes("load failed")
    ) {
      return "Falha de rede durante o envio. Verifique sua conexão e tente novamente.";
    }
    if (
      message.includes("jwt") ||
      message.includes("expired") ||
      message.includes("session") ||
      message.includes("sessão")
    ) {
      return "Sua sessão expirou. Entre novamente para continuar.";
    }
    if (
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("permission") ||
      message.includes("row-level security") ||
      message.includes("violates")
    ) {
      return "Você não tem permissão para enviar este arquivo.";
    }
    if (message.includes("exceeded the maximum allowed size") || message.includes("payload too large")) {
      return `Arquivo maior que ${MAX_UPLOAD_LABEL}.`;
    }
    // Mensagens já geradas pela validação local são seguras para exibir.
    if (raw && raw.length < 200 && !message.includes("supabase") && !message.includes("http")) {
      return raw;
    }
  }
  return "Não foi possível concluir o envio. Tente novamente em alguns instantes.";
}
