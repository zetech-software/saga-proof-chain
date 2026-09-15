# Publicar os registros da Saga no portal (sem data e hora para o cliente)

Subir os quatro arquivos anexados para o portal, visíveis para Mariana, Léo e para a equipe no painel admin. Na área do cliente, nada de data nem hora; no painel admin as datas continuam visíveis para controle interno.

## O que será publicado

**Marca (aba Marcas)**
- SAGA MITOLOGIA CÓSMICA — titular Marisa Mariana Chaim Leo de Sousa, classe 41 (NCL 12), apresentação mista, protocolo 29409172364513441, status "Protocolada".

**Documentos (aba Documentos), vinculados a essa marca**
- Pedido de Registro de Marca — Saga Mitologia Cósmica (petição ao INPI).
- Protocolo INPI 29409172364513441 (formulário e comprovante).

**Certificados (aba Certificados)**
- Elementos de P.I Autoral — Saga Mitologia Cósmica (arquivo Saga Cósmica Elementos de P.I Autoral.zip), com hash da transação `0x6d0752…a70e`.
- Pseudônimo Anairam — registro de pseudônimo artístico/literário, com hash da transação `0x275e2b…fc44`.

Ambos com a rede do registro e o hash visíveis, mais o botão de verificação pública. Só a data/hora da transação deixa de aparecer para o cliente.

## Regra de datas

- Área do cliente (Marcas, Documentos, Certificados, resumo inicial): sem "enviado em", "emitido em", "última atualização" ou previsões com data.
- Painel admin: tudo como está hoje, com datas e horários completos.

## Detalhes técnicos

- Arquivos enviados para os buckets privados existentes (`documentos` e `certificados`), com download por URL assinada — mesmo fluxo já usado hoje.
- Registros criados em `trademarks`, `documents` e `certificates`, vinculados à organização "Saga Mitologia Cósmica" e com `created_by` do admin, de modo que Mariana e Léo enxerguem tudo pelas políticas de organização já vigentes. Sem alteração de schema nem de RLS.
- Ocultação de datas feita só na camada de apresentação das rotas de cliente (`painel.index`, `painel.marcas`, `painel.documentos`, `painel.certificados`), condicionada ao papel do usuário via `usePortalSession` — os componentes admin (`AdminTrademarksPanel`, `AdminDocumentsPanel`, histórico de acessos) permanecem inalterados.
- Os dados de data continuam gravados no banco; apenas não são exibidos ao cliente.
