<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Document-flow notifications reuse `support_notifications` (document_id/certificate_id columns) with recipients from `document_viewer_ids`/`trademark_viewer_ids` — one notification system, access-accurate recipients.
- Client document inserts are normalized by the `documents_before_insert` trigger (status forced to `recebido`, `is_additional` only via a visible `related_document_id` in `aguardando_documentacao`) — security never depends on the UI.
- Uploads: browser writes only to `<uid>/pending/*`; server fns in `src/lib/uploads.functions.ts` validate real bytes (DOCX via ZIP central directory) and move to final paths; clients never insert `documents` directly — the frontend is never the trust boundary.
- Prazo estimado: única função `estimateBusinessWindow` em `src/lib/portal.ts` (seg–sex, feriados nacionais + estadual SP 09/07, Sexta-feira Santa via cálculo da Páscoa; sem municipais/Carnaval/Corpus Christi) — uma só lógica para cliente, prévia admin e testes.
- Assistente IA do cliente: somente leitura, contexto montado no servidor com a sessão do próprio usuário (RLS) em `src/lib/ai-assistant.server.ts`; sem ferramentas, sem histórico; limite por `ai_question_usage` (só user_id+data) — a IA nunca decide permissão.
- Limite do assistente IA: consumido só pela função `consume_ai_question` (trava por usuário, grava detalhe + agregado `ai_usage_daily` na mesma transação), executável apenas pelo servidor com o id da sessão — sem corrida e sem o navegador escolher usuário.
- Histórico de uso da IA: detalhe por 2 dias (janelas móveis) + agregado diário user_id/dia/quantidade por 90 dias — guarda o mínimo necessário para 7/30 dias.
- Gerenciamento de documentos (editar/substituir/arquivar/restaurar/excluir) só por `src/lib/document-management.functions.ts`, com permissão decidida no servidor pela sessão e registro mínimo em `document_events` — o navegador nunca decide o que pode apagar.
