# Melhorias operacionais do assistente IA

Nenhuma mudança na segurança dos recursos, no fluxo de documentos, no prazo, nos links D1/C1/M1 ou nos poderes da IA. Sem ferramentas, sem histórico, sem guardar perguntas/respostas.

## 1. Indicador para o cliente
- Na caixa "Pergunte sobre seus processos": "13 de 20 disponíveis nesta hora · 82 de 100 disponíveis nas últimas 24h".
- Janelas móveis (última hora e últimas 24h), como o limite real aplicado hoje.
- Calculado no servidor a partir da tabela de controle existente. Nova consulta de leitura "meu uso"; cada resposta também devolve o saldo atualizado.
- Ao atingir o limite: "Limite atingido. Você poderá perguntar novamente por volta das 12:40." (horário de Brasília, calculado pelo registro mais antigo da janela). Sem IDs ou termos técnicos.
- Perguntas recusadas pela validação: testar se são contadas antes de afirmar.

## 2. Histórico 7/30 dias — opção A (guarda menos)
- Registros detalhados continuam apagados após 2 dias.
- Nova tabela `ai_usage_daily` com somente: user_id, day, count. Nada de pergunta, resposta, contexto, modelo ou custo.
- Retenção dos agregados: 90 dias, apagados pela rotina diária existente.
- Clientes não leem nem escrevem essa tabela.

## 3. Contagem consistente e sem corrida
- Uma única função no banco faz, na mesma transação: trava por usuário, confere 20/h e 100/24h, grava o registro detalhado e soma o agregado do dia. Ou ambos são gravados, ou nenhum.
- Função SECURITY DEFINER com execução revogada de PUBLIC, anon e authenticated; chamada somente pelo servidor confiável.
- Teste de concorrência real com várias requisições simultâneas perto do limite, confirmando que 20/h e 100/24h não são ultrapassados.

## 4. Relatório no Admin
- Seção discreta "Uso do assistente" na página Admin existente.
- Por cliente: nome, perguntas nas últimas 24h, 7 dias, 30 dias, "Último dia de uso" (só a data), total (90 dias) e "Custo estimado" (média medida × quantidade, sempre como estimativa, nunca valor exato).
- Total geral do sistema e busca por nome/e-mail.
- Consulta admin-only no banco (recusa não-admins).

## 5. Comparação de modelos (sem trocar em produção)
- Contexto sintético (nenhum dado real), mesmas perguntas: fatos, informação ausente, perguntas ambíguas, tentativas de burlar regras, referências D1/C1/M1.
- Modelos: gpt-6-astra, gemini-3.1-flash-lite, gemini-3.6-flash.
- Mede: acerto, invenções, recusa correta, resistência a injeção, consistência das referências, comportamento em ambíguas, latência, tamanho médio de contexto e de resposta, erros/timeouts do provedor, custo estimado.
- Recomendação no relatório; troca só com sua aprovação.

## 6. Testes
- Indicador: 0 perguntas, algumas, perto do limite, limite horário, limite 24h, virada de janela (horários simulados em contas temporárias), recarregar, duas abas, chamada direta, concorrência.
- Admin: admin vê; cliente não vê; chamada direta de cliente bloqueada; nenhum texto disponível; filtro; 1280 px e 390 px sem rolagem lateral.
- Contas temporárias apagadas; dados reais intactos.

## Detalhes técnicos
- Migração: `ai_usage_daily(user_id uuid, day date, count int, PK(user_id, day))`, GRANT só service_role, RLS sem políticas de cliente; função `consume_ai_question(_user uuid)` com `pg_advisory_xact_lock`, checagem de limites, INSERT em ai_question_usage + upsert no agregado, retornando saldo/retryAt; EXECUTE só service_role. `admin_ai_usage_summary()` com checagem has_role admin. Rotina diária existente também apaga agregados > 90 dias.
- Servidor chama `consume_ai_question` via cliente admin dentro do handler, após autenticação e validação.
- `ai-assistant.functions.ts`: nova `getMyAssistantUsage`; `AskResult` inclui `usage { hourLeft, dayLeft, retryAt? }`.
- Arquivos: `ai-assistant.server.ts`, `ai-assistant.functions.ts`, `ProcessAssistant.tsx`, novo `AdminAiUsagePanel.tsx`, `painel.admin.tsx`, `AGENTS.md`, `roadmap.md`.
