# Validação de segurança do modelo de titularidade + painéis de Marcas e Documentos

O modelo atual (organizations, organization_members, resource_shares, organization_id em marcas/documentos, admin global, certificados herdando permissão) é preservado integralmente. Nada de arquitetura paralela.

## 1. O que já foi verificado agora (somente leitura)

- **Volume de dados reais**: marcas = 0, documentos = 0, certificados = 0, perfis = 5. Ou seja, a "migração" dos registros existentes para a Saga atingiu **zero registros** — não há nenhum recurso pertencente a outro cliente vinculado indevidamente à Saga. Isso será reconfirmado registro a registro no relatório final.
- **Organização Saga**: 4 membros (Mariana, Léo e os dois admins).
- **Duas falhas reais encontradas**, ambas dentro do modelo atual:

### Falha A — organization_id não é validado na criação
As regras de criação de marcas e documentos exigem apenas que o autor seja o próprio usuário. Um cliente pode enviar, pela API, um `organization_id` de outra organização e assim empurrar o próprio recurso para dentro dela. Ele não passa a ver conteúdo alheio, mas expõe o dele a terceiros e suja a titularidade.

### Falha B — arquivos do Storage são legíveis por qualquer usuário logado
Hoje a leitura dos buckets `documentos` e `certificados` está liberada para todo usuário autenticado. Quem souber o caminho de um arquivo consegue baixá-lo mesmo sem ver o registro na listagem. A proteção existe apenas no banco, não no Storage — exatamente o cenário levantado no item 9.

## 2. Correções de segurança (uma migração)

- Exigir, na criação de marcas e documentos, que `organization_id` seja nulo, de uma organização da qual o usuário é membro, ou qualquer uma quando for admin.
- Restringir a leitura dos arquivos: administradores acessam tudo; os demais só acessam um arquivo se puderem ver o documento/certificado correspondente (mesma regra de organização e compartilhamento já existente).
- Integridade dos compartilhamentos: impedir referência a recurso inexistente e combinações inválidas de tipo/ID (duplicidade já está bloqueada pela chave única).
- Manter membros e compartilhamentos administráveis somente por administradores (já é o caso; será confirmado por teste).
- Admins permanecem membros da Saga apenas por conveniência de visualização; a autorização administrativa continua vindo exclusivamente do cargo. Confirmado por teste, sem alteração.

## 3. Bateria de testes com autenticação real

Sessões reais (não apenas consultas de banco) para: anônimo, admin 1, admin 2, Mariana, Léo e um cliente sem organização. Para cada perfil: marcas, documentos, certificados, acesso direto por ID, tentativa de alterar `organization_id` no payload, tentativa de inserir/alterar/remover membros e compartilhamentos, download direto de arquivo por caminho conhecido, e chamadas às funções administrativas.

Certificados terão auditoria própria: ligado a marca, ligado a documento, sem vínculo (só admin), vínculo inválido e acesso direto por ID.

## 4. Painel de Marcas com edição (evolução do painel existente)

Na área de administração já existente, sem módulo novo:
- busca por nome/titular, filtro por status e ordenação;
- detalhe da marca em painel lateral com edição de nome, titular, classe, segmento, número de protocolo, status e observações internas;
- exibição (somente leitura) da organização titular e dos compartilhamentos existentes;
- a edição nunca envia `organization_id`, `created_by` nem toca em compartilhamentos — troca de titularidade continua exclusivamente na seção "Titularidade e compartilhamento";
- validação de campos e mensagens claras de sucesso/erro.

O cliente continua apenas enviando e acompanhando, como hoje.

## 5. Painel de Documentos completo

Evolução da área existente:
- busca, filtro por status e por organização, estados vazio/carregando, layout mobile;
- visualização e download por link temporário assinado;
- para admin: upload, substituição de arquivo (mantendo o histórico do registro) e exclusão com confirmação, removendo também o arquivo do Storage;
- exibição da titularidade e dos compartilhamentos de cada documento;
- todas as ações respeitam as regras do banco e do Storage.

## 6. Titularidade e compartilhamento (consolidação, sem telas novas)

A seção existente ganha: lista de organizações e seus membros, filtro por tipo de recurso e por organização, indicação de quem recebeu cada compartilhamento e destaque de inconsistências (item sem organização, compartilhamento apontando para recurso inexistente, recurso sem autor). Nada de detalhe técnico de regra para cliente; o resumo técnico continua restrito ao admin.

## 7. Relatório final

Ao terminar, entrego o relatório completo pedido: resultado por perfil (Mariana, Léo, admins, outro cliente, anônimo), contagens por tipo vinculadas à Saga, resultado de cada tentativa de manipulação, auditoria de certificados e Storage, o que foi implementado em cada painel, migrações e políticas alteradas, arquivos alterados, bugs corrigidos, resultado de build/typecheck/lint e riscos remanescentes.

## Detalhes técnicos

- Migração única: policies `WITH CHECK` de INSERT em `trademarks`/`documents` incluindo `organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id) OR public.has_role(auth.uid(),'admin')`; nova função `public.can_view_storage_object(_user uuid, _bucket text, _path text)` (SECURITY DEFINER, sem EXECUTE para anon) usada nas policies de SELECT de `storage.objects` dos buckets `documentos` e `certificados`; trigger de validação em `resource_shares` para existência do recurso conforme `resource_type`.
- Sem novas tabelas, sem alteração de cargos, credenciais ou usuários.
- Frontend: evolução de `painel.admin.tsx`, `painel.marcas.tsx`, `painel.documentos.tsx`, `OwnershipManager.tsx` e novos componentes de detalhe/edição reutilizando os primitivos de UI já existentes.
- Testes via Playwright com sessões reais de cada conta + chamadas diretas à API com o token de cada usuário.
