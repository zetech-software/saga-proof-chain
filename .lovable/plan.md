# Melhorias operacionais do assistente IA

Nenhuma mudança na segurança dos recursos, no fluxo de documentos, no prazo, nos links D1/C1/M1 ou nos poderes da IA. Sem ferramentas, sem histórico, sem guardar perguntas/respostas.

## 1. Indicador para o cliente
- Na caixa "Pergunte sobre seus processos", linha discreta: "13 perguntas restantes nesta hora · 82 nas últimas 24 horas".
- Os limites atuais são janelas móveis (última hora e últimas 24 horas), não "hora cheia"/"dia do calendário". O texto dirá isso honestamente ("nas últimas 24 horas") em vez de "hoje".
- Calculado no servidor a partir da tabela de controle existente (sem tabela nova). Nova consulta de leitura "meu uso"; a resposta de cada pergunta também devolve o saldo atualizado.
- Ao atingir o limite: "Limite atingido. Você poderá perguntar novamente por volta das 12:40." (horário calculado pelo registro mais antigo da janela, em Brasília). Sem IDs ou termos técnicos.
- Perguntas recusadas pela validação: verificar por teste se são contadas antes de afirmar qualquer coisa.

## 2. Histórico 7/30 dias — opção A (guarda menos)
- Registros detalhados continuam sendo apagados após 2 dias.
- Nova tabela mínima de agregados diários: cliente + dia + quantidade. Sem texto, sem horário exato, sem contexto.
- Contagem diária somada no servidor a cada pergunta válida (junto com o registro atual). Retenção dos agregados: 90 dias, apagados pela rotina diária existente.
- Cliente não lê nem escreve essa tabela diretamente; só o servidor e a consulta admin.

## 3. Relatório no Admin
- Nova seção discreta "Uso do assistente" dentro da página Admin existente.
- Por cliente: nome, perguntas nas últimas 24h, 7 dias, 30 dias, última utilização (dia), total (90 dias) e custo estimado (média medida × quantidade, marcado como estimativa).
- Total geral do sistema e busca por nome/e-mail.
- Consulta admin-only no banco (mesmo padrão das outras consultas de admin, recusa não-admins).

## 4. Comparação de modelos (sem trocar em produção)
- Script de teste com contexto sintético (nenhum dado real) e as mesmas ~12 perguntas: fatos, informação ausente, tentativas de burlar regras, referências D1/C1/M1.
- Modelos: gpt-6-astra, gemini-3.1-flash-lite, gemini-3.6-flash. Mede acerto, invenções, recusa correta, fontes válidas, latência e custo (pelos registros de uso de IA).
- Recomendação no relatório final; troca só com sua aprovação.

## 5. Testes
- Indicador: 0 perguntas, algumas, perto do limite, limite horário, limite 24h (registros inseridos em contas temporárias com horários simulados para testar virada de janela), recarregar página, duas abas, chamada direta.
- Admin: admin vê; cliente não vê a seção; chamada direta de cliente bloqueada; nenhum texto disponível; filtro; 1280 px e 390 px sem rolagem lateral.
- Contas temporárias apagadas ao final; dados reais intactos.

## Detalhes técnicos
- Migração: `ai_usage_daily(user_id, day date, count int, PK(user_id, day))`, GRANT só service_role/authenticated select negado; RLS sem políticas de cliente; função SECURITY DEFINER `increment_ai_usage_daily` (executável apenas pelo servidor) ou upsert via cliente admin dentro do handler após validação; função `admin_ai_usage_summary()` com checagem has_role admin; a rotina `cleanup-ai-question-usage` ganha também DELETE de agregados > 90 dias.
- `ai-assistant.functions.ts`: nova `getMyAssistantUsage` (autenticada, cliente) e `AskResult` passa a incluir `usage { hourLeft, dayLeft, retryAt? }`.
- Arquivos: `ai-assistant.server.ts`, `ai-assistant.functions.ts`, `ProcessAssistant.tsx`, novo `AdminAiUsagePanel.tsx`, `painel.admin.tsx`, `AGENTS.md`, `roadmap.md`.
