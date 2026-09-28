import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/portal";

const LABEL: Record<string, string> = {
  editado: "Editado",
  arquivo_substituido: "Arquivo substituído",
  arquivado: "Arquivado",
  restaurado: "Restaurado",
  excluido: "Excluído definitivamente",
};

/** Histórico mínimo de ações do documento (somente admin, via regras de acesso). */
export function DocumentHistory({ documentId }: { documentId: string }) {
  const q = useQuery({
    queryKey: ["document-events", documentId],
    queryFn: async () => {
      const [{ data: events }, { data: users }] = await Promise.all([
        supabase
          .from("document_events")
          .select("id, action, actor_id, details, created_at")
          .eq("document_id", documentId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const names = new Map((users ?? []).map((u) => [u.id, u.full_name || u.email || "Usuário"]));
      return (events ?? []).map((e) => ({ ...e, actor: e.actor_id ? (names.get(e.actor_id) ?? "Usuário removido") : "Sistema" }));
    },
  });
  if (!q.data?.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium">Histórico de ações</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {q.data.map((e) => {
          const d = (e.details ?? {}) as Record<string, string | null>;
          return (
            <li key={e.id} className="break-words">
              {formatDateTime(e.created_at)} · {LABEL[e.action] ?? e.action} · {e.actor}
              {e.action === "arquivo_substituido" && d['previous_file_name']
                ? ` · ${d['previous_file_name']} → ${d['new_file_name']}`
                : ""}
              {d['reason'] ? ` · Motivo: ${d['reason']}` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
