# Fechamento do fluxo de documentos (sem novas funcionalidades)

Nenhuma IA de análise nem página pública será implementada. Os itens 6A e 6B entram só como análise no relatório.

## 1. Validação dos uploads no servidor (solução mínima segura)

Três camadas, mantendo os arquivos privados e os links temporários atuais:

1. **Regras no próprio armazenamento:** nos repositórios `documentos` e `certificados`, definir o limite de 50 MB e a lista de tipos permitidos (PDF, JPEG, PNG, DOC, DOCX). Qualquer envio fora disso é recusado pelo armazenamento, mesmo que alguém ignore a tela.
2. **Conferência do conteúdo no servidor:** uma função segura roda depois do upload e antes de criar o registro. Ela:
   - lê os primeiros bytes do arquivo já armazenado, usando o login do próprio usuário;
   - confere se a assinatura real bate com a extensão (PDF `%PDF`, JPEG `FFD8FF`, PNG `89504E47`, DOC `D0CF11E0`, DOCX `504B0304` com `[Content_Types].xml` e `word/`);
   - confere se o tamanho armazenado é de até 50 MB;
   - se o arquivo for inválido, apaga-o e recusa; se for válido, cria o registro do documento com as permissões do próprio usuário.
3. **Proteção contra atalhos:** os clientes deixam de poder criar registros de documento diretamente. Eles passam só pela função da camada 2, e o admin segue o mesmo caminho. Esta é a única mudança nas regras de acesso, e será reportada. As demais regras de visibilidade ficam iguais.

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

Conferir antes e depois dos testes, com contagem nominal de cada item:

- usuários, documentos, certificados, notificações, compartilhamentos, vínculos de organização e arquivos temporários;
- os dados reais: 5 documentos, 4 certificados e 3 usuários.

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
- enviar um executável renomeado como .pdf ou .docx, direto ao armazenamento e pela função, sem passar pela tela.

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

- Repositórios: `storage.buckets.file_size_limit = 52428800` e `allowed_mime_types` com os 5 tipos, aplicados pela ferramenta de configuração de armazenamento.
- Arquivo novo `src/lib/uploads.functions.ts`:
  - `registerDocumentUpload` e `registerCertificateUpload` usam `createServerFn` com `requireSupabaseAuth`;
  - lêem os primeiros bytes com `download` e range sobre o client do usuário; para DOCX, lêem até 64 KB para achar as entradas ZIP;
  - validam com zod e depois inserem o registro com o client do usuário, então o RLS e o trigger `documents_before_insert` continuam valendo;
  - se `src/start.ts` ainda não enviar o token do usuário ao servidor, registrar `attachSupabaseAuth` ali.
- Migração:
  - trocar a policy de INSERT dos clientes em `documents` por um caminho restrito, com uma coluna `upload_verified boolean default false`;
  - a policy de INSERT passa a exigir `upload_verified = true`, preenchido só pela função do servidor por meio de uma RPC `SECURITY DEFINER` que confirma o objeto no armazenamento;
  - as regras de ownership e organização ficam intactas.
- `painel.documentos.tsx`, `AdminDocumentsPanel.tsx`, `AdminCertificatesPanel.tsx` e `painel.admin.tsx` passam a chamar as funções novas em vez de inserir direto.
- Testes: Playwright com capturas em 1280 e 390 px, e scripts REST com tokens temporários.
