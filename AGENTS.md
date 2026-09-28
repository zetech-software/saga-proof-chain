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
