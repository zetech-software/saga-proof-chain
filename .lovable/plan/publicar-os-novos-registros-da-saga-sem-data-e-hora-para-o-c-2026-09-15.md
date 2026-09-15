# Publicar os novos registros da Saga (sem data e hora para o cliente)

Cinco novos arquivos entram no portal, vinculados à marca SAGA MITOLOGIA CÓSMICA e à organização Saga, seguindo a mesma regra já em vigor: Mariana e Léo veem tudo sem nenhuma data ou hora; no painel interno as datas continuam visíveis.

## Certificados em blockchain (2)

1. **SAGA MITOLOGIA CÓSMICA — Universo transmídia**
   - Arquivo registrado: download (1).zip
   - Titular: Marisa Mariana Chaim Leo de Sousa
   - Hash da transação: 0x6dd42e3c298be5f438fe9992f17bfd78fef4710f3005e835c21cae2a59d9e9ea
   - Botão de verificação pública (sem mostrar a data da transação)

2. **Saga Mitologia Cósmica — Fase 1**
   - Arquivo registrado: Reg. Block - Saga Mitologia Cosmica.pdf
   - Hash da transação: 0x01f0a43b0304a9bf8a14102c967fa61a39c4c2b8e1a7c349b99056343f2b8f78
   - Botão de verificação pública

Ambos entram como certificados emitidos, com download do PDF e o hash visível.

## Documentos (3)

3. **Escopo contratado — BVP / Mariana Chaim**
   Resumo do escopo: lista de materiais para proteção autoral em blockchain e lista de documentos necessários para o registro de marca no INPI.

4. **Apresentação Amazon Prime Video — Parte 1**
   Comprovação da submissão da Saga à Amazon.

5. **Apresentação Amazon Prime Video — Parte 2**
   Continuação da mesma submissão.

Os três ficam listados na área de Documentos, com download, descrição e situação — sem data nem hora para o cliente.

## Detalhes técnicos

- Upload dos 5 arquivos nos buckets privados `documentos` e `certificados`; download sempre por URL assinada.
- Novos registros em `documents` e `certificates` vinculados à marca existente e à organização Saga (`organization_id`), `created_by` = conta admin.
- Nenhuma alteração de schema, RLS ou regras de permissão.
- Nenhuma alteração de interface necessária: a ocultação de datas para clientes já está implementada nas telas de visão geral, marcas, documentos e certificados.
- Verificação final com login de cliente e de admin para confirmar que o cliente não vê datas e que o admin vê tudo.
