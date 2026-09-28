# Fluxo completo: cliente envia documentos, admin devolve certificado

Tudo aproveita o que já existe (tabelas de documentos e certificados, titularidade, compartilhamento, notificações e arquivos privados). Nenhuma estrutura paralela.

## Fluxo

```text
Cliente envia (1 ou vários arquivos) -> Admin recebe (notificação)
-> Admin analisa / muda status (cliente notificado)
-> "Aguardando documentação" -> cliente envia arquivo adicional (admin notificado)
-> Admin anexa certificado vinculado -> status "Concluído" -> cliente baixa
```

## Cliente
- Card "Documentos" no início com o novo texto; o prazo médio continua como informação secundária.
- Página Documentos:
  - Botão "Enviar documentos" com vários arquivos de uma vez. Título opcional (usa o nome do arquivo quando vazio).
  - Lista com nome, tipo, tamanho, status e botão de baixar.
  - Data e hora aparecem **só nos arquivos que o próprio cliente enviou**. Os registros já publicados continuam sem data.
  - Faixa com o status atual. Quando houver pendência, aparece "Aguardando documentação — envie o arquivo faltante".
  - Bloco "Seu certificado está disponível" com o botão "Baixar certificado" quando houver certificado vinculado.
  - Mostra carregando, erro amigável, estado vazio e sucesso.
- Formatos aceitos: exatamente PDF, JPG, JPEG, PNG, DOC e DOCX. WEBP e ZIP deixam de ser aceitos. Limite de 50 MB por arquivo. Formatos perigosos continuam bloqueados.
- Envios anteriores nunca são apagados nem substituídos; o histórico fica em ordem cronológica.

## Status (reaproveita os existentes, com 2 novos)
- Documentos enviados (`recebido`, com novo rótulo)
- Em análise (`em_analise`)
- Aguardando documentação (novo, `aguardando_documentacao`)
- Em andamento (novo, `em_andamento`)
- Concluído (`certificado_emitido`, com o rótulo "Concluído")
- Os status atuais (Protocolado no INPI, Documento, blockchain e Pendência) continuam valendo. Nenhum status muda sozinho.

## Admin (evolui o painel de documentos atual)
- Busca por cliente (nome/e-mail) e por organização, e filtros por status e por período.
- Cada item mostra quem enviou, a organização e a data/hora; também marca "Envio adicional" quando chega depois de um pedido de documentação.
- Detalhes, download e troca de status já existem e serão mantidos.
- Botão "Enviar certificado" no documento: abre o formulário de certificado atual já vinculado a esse documento. Ao publicar, pode marcar o documento como "Concluído".

## Notificações (amplia o sistema atual, sem criar outro)
- Admin: novo documento enviado e documento adicional enviado.
- Cliente: status atualizado, documentação solicitada e certificado disponível.
- Sem duplicados: um aviso por evento; um status repetido não gera novo aviso.
- Os avisos entram nos mesmos contadores do menu, com link para Documentos/Certificados.

## Segurança
- Cliente: só envia em seu nome e na própria organização (regra atual mantida). Não altera status, dono nem organização (atualizações continuam só para admin). Não cria certificado. Só baixa arquivos permitidos, pois os arquivos seguem privados e com link temporário.
- Nome no armazenamento gerado de forma aleatória (padrão atual); o nome original fica só para exibição.
- Mariana e Léo continuam vendo tudo da Saga; outros clientes, só o que é deles ou foi compartilhado; admin vê tudo.

## Testes
Admin, Mariana, Léo, outro cliente temporário (removido ao final) e visitante. Cenários do pedido: PDF e imagem, formato proibido, arquivo acima do limite, download próprio e alheio, tentativas diretas de trocar status/organização, envio adicional, certificado, acesso por caminho/API. Também build, typecheck, lint, console e telas em desktop, tablet e 390px. Relatório final nos 15 itens pedidos.

## Detalhes técnicos
- Migração:
  - Amplia o enum `support_notification_type` com `new_document`, `additional_document`, `document_status`, `documents_requested` e `certificate_available`.
  - Adiciona em `support_notifications` as colunas `document_id` e `certificate_id`, ambas nulas, e torna `support_request_id` opcional (DROP NOT NULL, aditivo e sem perda de dados).
  - Troca o índice único por índices parciais por recurso.
  - Adiciona `documents.is_additional boolean default false`.
- Triggers SECURITY DEFINER (EXECUTE revogado de anon/authenticated):
  - INSERT em documents com `created_by` não admin notifica os admins (adicional quando já existe documento do usuário/org em `aguardando_documentacao`).
  - UPDATE de status notifica o criador e os membros da organização.
  - INSERT em certificates notifica os usuários com acesso ao documento/marca vinculado.
- O RLS atual de documents e certificates não muda.
- Código:
  - `uploads.ts` recebe a lista de formatos e o DOC.
  - `portal.ts` recebe os status.
  - Alterados `painel.documentos.tsx`, `painel.index.tsx`, `AdminDocumentsPanel.tsx`, `AdminCertificatesPanel.tsx` (vínculo pré-preenchido), `useSupportNotifications.ts` e `PortalLayout.tsx`.

## Ajustes obrigatórios (aprovados)
- **Envio adicional ligado ao processo:** o cliente responde a um pedido específico ("Enviar arquivo faltante" dentro do documento em "Aguardando documentação"). Nova coluna `documents.related_document_id` (nula, referencia documents). Só é "Envio adicional" quando aponta para um documento que o cliente pode ver e que está em `aguardando_documentacao`; isso é validado por trigger no banco. Um envio avulso nunca vira adicional.
- **Auditoria dos status antes de exibir:** os status são agrupados por natureza e não formam uma sequência única:
  - Processo de envio: Documentos enviados, Em análise, Aguardando documentação, Em andamento, Concluído.
  - INPI: Protocolado no INPI.
  - Blockchain: Na esteira blockchain, Registrado em blockchain, Certificado emitido.
  - Informativo: Documento, Pendência.
  O seletor do admin mostra os grupos separados. `certificado_emitido` mantém o rótulo atual. "Concluído" vira um status próprio (`concluido`), para não mudar a semântica do blockchain.
- **Notificação só para quem tem acesso:** os destinatários são calculados por usuário com as mesmas regras do acesso (`can_view_document` / `can_view_trademark` / `has_share`, avaliadas para cada candidato no trigger), nunca "todos da organização" às cegas.
- **DOC/DOCX:** a extensão e o tipo informado precisam bater, e os primeiros bytes são conferidos (DOC = assinatura OLE `D0 CF 11 E0`; DOCX = ZIP `PK`; PDF `%PDF`; JPG `FF D8 FF`; PNG `89 50 4E 47`). O bucket continua privado.
- **Limite de 50 MB** em uma única constante central de configuração, usada no formulário, nas mensagens e no admin.
- **Conta de teste temporária:** criada só para os testes de isolamento, sem acesso à organização Saga nem a dados reais. Os arquivos, registros, avisos e acessos dela são apagados ao final e depois a própria conta é removida; a remoção é conferida por consulta.
