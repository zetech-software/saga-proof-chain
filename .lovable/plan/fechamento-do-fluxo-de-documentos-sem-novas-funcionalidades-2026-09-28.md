# Fechamento do fluxo de documentos (sem novas funcionalidades)

Nenhuma IA de análise nem página pública será implementada. Os itens 6A e 6B entram só como análise no relatório.

## 1. Validação dos uploads no servidor (solução mínima segura)

Os arquivos continuam privados e os links continuam temporários.

1. **Área de espera:** o navegador só consegue enviar arquivos para uma pasta temporária do próprio usuário. Um arquivo nessa pasta não é documento:
   - não aparece em nenhuma lista;
   - não tem registro;
   - ninguém além do sistema consegue abri-lo.
2. **Validação final no servidor:** uma função do servidor confirma quem está logado e recusa pastas de outra pessoa. Depois ela baixa o arquivo inteiro (até 50 MB) e confere o conteúdo real:
   - PDF, JPEG, PNG e DOC pela assinatura interna do arquivo;
   - DOCX pela estrutura completa: o índice do ZIP é lido e o arquivo precisa ter `[Content_Types].xml` declarando um documento Word, além de `word/document.xml`. Um ZIP comum renomeado para .docx é recusado.
3. **Se o arquivo for inválido:** ele é apagado na hora e o envio é recusado.
4. **Se o arquivo for válido:**
   - o servidor move o arquivo para o local definitivo;
   - cria o registro com dono, organização, status e caminho decididos pelo próprio servidor;
   - a organização só é aceita se o usuário for membro dela ou admin, e o processo relacionado só se estiver visível para ele e aguardando documentação.
5. **Sem atalho para o cliente:** o cliente perde a permissão de criar registros de documento diretamente. Não existe nenhuma marca de "verificado" que ele possa preencher, nem uma função genérica que ele possa chamar para isso. Esta é a única mudança nas regras de acesso, e será reportada.
6. **Limpeza de arquivos abandonados:** uma rotina periódica protegida apaga arquivos da área de espera com mais de 24 horas.
7. **Camada extra:** o limite de 50 MB e os tipos permitidos também ficam configurados no armazenamento. Isso é só uma proteção adicional, porque o tipo informado pelo navegador pode ser falsificado. A decisão final é sempre da validação no servidor.

O limite de 50 MB e a lista de formatos continuam em um único ponto, usado pela tela e pelo servidor.

## 2. Auditoria visual real do Admin (desktop e 390 px)

- Usar uma conta admin temporária, criada no teste e removida no final.
- Os dados de teste serão temporários, e os documentos reais só serão lidos, nunca alterados.
- Cada item do pedido terá uma captura de tela: lista, busca, filtros por status e período, cliente e organização, etiqueta "Envio adicional", processo relacionado, alteração de status, "Enviar certificado" com formulário pré-vinculado, notificações e contadores, nomes longos, arquivo sem título, estado vazio, carregamento e mensagens de erro.
- Defeitos visuais reais serão corrigidos só nos arquivos de tela afetados.

## 3. Mariana e Léo (somente banco e regras de acesso)

- Não haverá login, troca de senha nem acesso artificial às contas deles.
- Confirmar pelo banco:
  - os dois continuam membros da Saga;
  - têm acesso aos 5 documentos e aos certificados correspondentes;
  - não têm acesso a recursos de outros clientes;
  - não têm papel de admin.
- O relatório registra que o teste com sessão real depende de um deles entrar no sistema, e isso não conta como falha.

## 4. Revalidação da limpeza

- Cada registro criado pelos testes tem seu identificador guardado no momento da criação: usuários, documentos, certificados, notificações, compartilhamentos, vínculos de organização, visualizações e arquivos.
- A limpeza apaga somente esses identificadores e o que depende deles.
- Nada é apagado por diferença de contagem. As contagens servem apenas para conferência.
- Antes e depois, os identificadores dos dados reais são comparados para provar que nada real foi removido.

## 5. Teste final do fluxo completo

A sequência pedida, de ponta a ponta, com um cliente e um admin temporários:

- cliente envia documento; admin recebe aviso;
- admin muda o status; cliente recebe aviso;
- admin solicita documento; cliente responde naquele processo; admin vê "Envio adicional";
- admin envia certificado; processo fica concluído; cliente vê e baixa o certificado.

Tentativas diretas, que devem ser bloqueadas:

- alterar status, `organization_id` ou `created_by`;
- criar certificado;
- acessar arquivo alheio;
- usar `related_document_id` inválido;
- criar registro de documento direto no banco;
- chamar a função do servidor forjando usuário, organização, caminho de outro usuário, "verificado" ou arquivo alheio;
- enviar um executável renomeado como .pdf ou .docx e um ZIP comum renomeado como .docx;
- abrir um arquivo que ainda está na área de espera.

Todas as contas e dados temporários serão removidos no final.

## 6 e 7. Relatório final

Conteúdo:

- proteção dos uploads no servidor;
- auditoria visual;
- validação de Mariana e Léo;
- confirmação da limpeza;
- resultado do fluxo completo;
- riscos restantes;
- análise da IA documental: utilidade, privacidade, dados enviados, custo, falsos positivos, uso apenas como apoio ao admin e para todos os clientes, sem decidir sozinha;
- análise da página pública de verificação: código aleatório de pelo menos 128 bits, só dados públicos deliberados, sem enumeração, com limite de consultas e resposta idêntica para códigos inexistentes.

## Detalhes técnicos

- **Buckets:** `file_size_limit = 52428800` e `allowed_mime_types` com os 5 tipos, como camada extra.
- **Storage policies:**
  - o INSERT do cliente fica restrito a `<uid>/pending/*`;
  - `can_view_storage_object` passa a negar qualquer caminho com `/pending/`, inclusive para o dono;
  - os caminhos definitivos continuam como hoje.
- **`src/lib/uploads.functions.ts`**, com a lógica em `uploads.server.ts`:
  - `finalizeDocumentUpload` e `finalizeCertificateUpload` usam `createServerFn` com `requireSupabaseAuth`, entrada validada por zod e nenhum campo de dono ou verificação aceito;
  - o caminho precisa começar com `<userId>/pending/`;
  - o tamanho vem dos metadados do objeto e é conferido de novo no download;
  - DOCX: localizar o EOCD, percorrer o central directory, exigir `[Content_Types].xml` com o tipo `wordprocessingml.document.main` e a entrada `word/document.xml`;
  - DOC: assinatura OLE `D0CF11E0A1B11AE1`;
  - em caso de sucesso: `move` para `<userId>/<rand>.<ext>` e INSERT com `supabaseAdmin`, carregado dentro do handler depois das checagens de ownership e organização, feitas com o client do usuário (`is_org_member`, `has_role`, visibilidade do documento relacionado via RLS);
  - em caso de falha: `remove` do objeto pendente;
  - certificados: só admin, confirmado com `has_role` pelo client do usuário.
- **Migração:**
  - `REVOKE INSERT ON documents FROM authenticated` e remoção das policies de INSERT de clientes em documents e certificates;
  - `documents_before_insert` mantém a normalização para inserts sem `auth.uid()`, usando os valores passados pelo servidor;
  - nenhuma nova RPC `SECURITY DEFINER` será exposta a anon, PUBLIC ou authenticated;
  - revisão dos grants existentes.
- **Arquivos órfãos:** `src/routes/api/public/cron/cleanup-pending.ts`:
  - exige um segredo no cabeçalho;
  - lista `*/pending/*` com mais de 24 h e apaga;
  - é agendado por `pg_cron` com `pg_net`.
- **Telas:** `painel.documentos.tsx`, `AdminDocumentsPanel.tsx`, `AdminCertificatesPanel.tsx` e `painel.admin.tsx` enviam para a área de espera e chamam a função de finalização; a mensagem de erro fica amigável.
- `src/start.ts` recebe `attachSupabaseAuth` se ainda não houver algo equivalente.
- **Testes:** Playwright em 1280 e 390 px, scripts REST com tokens temporários e limpeza pelos IDs registrados.
