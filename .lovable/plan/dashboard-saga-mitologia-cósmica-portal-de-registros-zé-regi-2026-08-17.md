# Dashboard Saga Mitologia Cósmica — Portal de Registros (Zé Registra)

Portal privado para Mariana e Léo acompanharem registro de marcas, envio de documentos e certificados em blockchain, com painel interno para a equipe Zé Registra.

## Acesso

- Login por e-mail e senha (backend Lovable Cloud).
- Mariana e Léo têm usuários separados, mas veem exatamente os mesmos dados (workspace único do cliente).
- Papel `admin` (Zé Registra) enxerga tudo e gerencia os registros.
- Sem cadastro público: contas criadas pelo admin.

## Áreas do cliente

1. **Registro de Marcas**
   - Formulário para submeter nova marca (nome, classe/segmento, titular, observações, anexos).
   - Lista das marcas submetidas com status (Em análise, Protocolada, Deferida, etc.) e data.

2. **Documentos**
   - Upload de documentos (PDF/imagem) que entram na esteira de registro em blockchain.
   - Lista com nome, tamanho, data de envio, status da esteira e previsão de conclusão.
   - Aviso fixo do prazo: 7 a 25 dias úteis por documento.

3. **Certificados Blockchain**
   - Lista de certificados emitidos, atualizada em tempo real conforme o admin publica.
   - Download do certificado, hash da transação, data/hora e link de verificação.
   - Links para os sites oficiais de consulta (INPI, explorador de blockchain, etc.) para consulta autônoma.

Home do painel: resumo com contadores (marcas, documentos na esteira, certificados emitidos) e últimas atualizações.

## Painel admin (Zé Registra)

- Ver todos os pedidos de marca e documentos.
- Alterar status, adicionar observações e datas de previsão.
- Fazer upload/publicar certificados vinculados a um documento ou marca.
- Criar contas de acesso do cliente.

## Visual

- Direção escura cósmica alinhada à marca Saga Mitologia Cósmica: fundo profundo (azul-noite/roxo), acentos dourados e violeta, títulos em serifada elegante, corpo em sans (Montserrat/Playfair), detalhes sutis de estrelas/gradiente.
- Interface em português.
- Rodapé em todas as telas com "Powered by Zé Registra" e a logo enviada (fundo escuro).

## Detalhes técnicos

- Lovable Cloud (banco + auth + storage) com RLS.
- Tabelas: `profiles`, `user_roles` (enum admin/cliente), `trademarks`, `documents`, `certificates`.
- Buckets privados para documentos e certificados, com URLs assinadas.
- Realtime nas tabelas de documentos e certificados para atualização em tempo real.
- Rotas protegidas sob `_authenticated`; server functions autenticadas para leitura/escrita.
- Logo Zé Registra publicada como asset via CDN.

## Fora do escopo desta etapa

- Integração automática com a blockchain (status e certificados são publicados pelo admin).
- Notificações por e-mail (posso adicionar depois).
