# Triagem técnica das 8 sugestões pendentes

Nada será implementado agora. Abaixo, avaliação individual, consolidação e ordem recomendada.

## Achado importante que muda a prioridade

Ao revisar as regras atuais, marcas, documentos e certificados continuam com leitura liberada para **qualquer usuário autenticado**. Você confirmou que Mariana e Léo devem ser tratados como **equipe única da Saga** — logo, esse compartilhamento é intencional e nada muda no banco. Fica apenas registrado como decisão de produto: qualquer cliente novo que não seja da Saga passaria a enxergar esse conteúdo, então a entrada de um cliente de outra empresa exige revisar essa regra antes.

## Avaliação individual

### 1. Segurança dos e-mails de clientes — prioridade ALTA (parcialmente resolvida)
- **O que seria**: garantir que e-mail/nome de um cliente nunca apareça para outro cliente, incluindo telas de suporte e admin, e mascarar e-mails em listagens onde não são necessários.
- **Problema real**: vazamento de dados pessoais entre clientes.
- **Já existe?** Sim, o essencial já foi feito: `profiles` agora é "só o próprio ou admin". O que resta é conferir se algum campo de texto (ex.: histórico de suporte, notas administrativas) devolve e-mail de terceiros.
- **Duplicação**: nenhuma.
- **Banco/RLS**: provavelmente nenhuma; apenas verificação. Se sobrar exposição, ajuste pontual de consulta.
- **Regressão**: muito baixa.
- **Recomendação**: fazer agora, junto com o item do achado acima (mesma auditoria).

### 2. Painel de privacidade — prioridade MÉDIA
- **O que seria**: uma aba administrativa que mostra, em linguagem simples, quem pode ver o quê (regras por tabela), com sinalização de itens fora do padrão.
- **Problema real**: hoje só é possível saber isso pedindo auditoria em chat.
- **Já existe?** Não. Mas se sobrepõe fortemente aos itens 4 e 5.
- **Duplicação**: alta se virar tela separada.
- **Banco/RLS**: exigiria uma função somente-leitura para admin listar as regras vigentes.
- **Regressão**: baixa (só leitura).
- **Recomendação**: implementar **depois**, como aba dentro da área única de administração (ver consolidação).

### 3. Painel de usuários completo — prioridade MÉDIA-ALTA
- **O que seria**: evolução da seção atual de atividade: busca por nome/e-mail, ordenação, contagem por perfil, detalhe do usuário (marcas, documentos e chamados dele), exportação CSV.
- **Problema real**: hoje a lista é apenas leitura de acesso, sem busca nem visão consolidada por cliente.
- **Já existe?** Sim, a base: `admin_list_user_activity()` + seção "Atividade de acesso". Seria extensão, não tela nova.
- **Duplicação**: alta se criada como tela separada — deve **absorver** a seção atual.
- **Banco/RLS**: pode reaproveitar a RPC existente; contagens por usuário exigiriam ampliar essa mesma função (sem nova tabela).
- **Regressão**: média — mexe em código já validado do painel Admin.
- **Recomendação**: implementar depois da camada de segurança.

### 4. Status de conta no painel — prioridade MÉDIA
- **O que seria**: para o cliente, em "Minha conta": perfil/cargo, data de cadastro, último acesso, e-mail confirmado, aviso de senha; para o admin, o mesmo dado por usuário.
- **Problema real**: o cliente hoje só tem troca de senha em "Minha conta".
- **Já existe?** A rota `/painel/conta` existe; os dados existem via RPC de admin. Falta uma versão "só os meus dados" para o cliente.
- **Duplicação**: média — os dados são os mesmos do item 3, vistos por outra lente.
- **Banco/RLS**: precisaria de uma função segura "meus dados de conta" (retornando só o próprio registro) — não pode reutilizar a RPC de admin.
- **Regressão**: baixa (área isolada).
- **Recomendação**: implementar depois do item 3, reusando a mesma função de leitura.

### 5. Notificações de novo acesso — prioridade BAIXA
- **O que seria**: alertar o admin quando um usuário faz login (ou primeiro login).
- **Problema real**: pouco; a lista de atividade já responde "quem entrou e quando".
- **Já existe?** Parcialmente (atividade de acesso).
- **Duplicação**: alta.
- **Banco/RLS**: exigiria nova tabela de eventos de login + gatilho, já que o histórico de login não é registrado hoje (só o último acesso).
- **Regressão**: média (nova escrita a cada login).
- **Recomendação**: não implementar agora.

### 6. Notificações de chamado no admin — prioridade BAIXA (já entregue)
- **Já existe?** Sim, completo: tabela de notificações, gatilhos, tempo real e selo no menu.
- **Recomendação**: não implementar; no máximo pequenos ajustes visuais se você apontar algo.

### 7. Painel de marcas (admin) — prioridade BAIXA
- **O que seria**: filtros por status, busca e ações em lote sobre marcas.
- **Já existe?** Sim, "Marcas submetidas" no painel Admin, com edição de status.
- **Duplicação**: alta.
- **Recomendação**: não criar tela nova; se necessário, apenas adicionar filtro/busca na seção existente, depois.

### 8. Painel de documentos (admin) — prioridade BAIXA
- **O que seria**: o mesmo, para documentos.
- **Já existe?** Sim, "Documentos na esteira".
- **Recomendação**: idem — só filtro/busca na seção existente, depois.

## Consolidação: uma única área de administração

Sim, as quatro sugestões destacadas podem (e devem) virar **uma só área**, sem telas novas espalhadas:

```text
/painel/admin
├─ Esteira (documentos, marcas, certificados, suporte)   [já existe]
└─ Aba "Usuários e privacidade"                          [nova, única]
   ├─ Lista de usuários (busca, filtros de acesso, detalhe)   ← itens 3 e 4
   └─ Resumo de privacidade (quem vê o quê, alertas)          ← item 2
```

E, para o cliente, "Status de conta" fica dentro da tela `/painel/conta` já existente — não vira rota nova. Assim, 4 sugestões viram 1 aba administrativa + 1 bloco na conta do cliente.

## Decisão registrada

Marcas, documentos e certificados permanecem **compartilhados entre os clientes da Saga** (equipe única). Nenhuma mudança de RLS nessas três tabelas. Revisitar apenas se entrar um cliente de outra empresa.

## Ordem recomendada

1. **Varredura final de e-mails e dados pessoais** (item 1) — confirmar que nenhuma tela, consulta ou resposta de API ainda devolve nome/e-mail de terceiros; risco quase nulo e fecha o tema privacidade.
2. **Aba "Usuários e privacidade" no Admin — parte usuários** (item 3, absorvendo a seção atual) — dá ao time visão completa sem criar telas paralelas.
3. **Status de conta do cliente em /painel/conta** (item 4) — reaproveita a leitura criada no passo 2.
4. **Resumo de privacidade na mesma aba** (item 2) — depende das regras finais do passo 1 para não nascer desatualizado.
5. **Filtros e busca nas seções de marcas e documentos do Admin** (itens 7 e 8) — melhoria incremental, sem tela nova.
6. **Não implementar**: notificações de novo acesso (item 5) e notificações de chamado (item 6, já pronto).
