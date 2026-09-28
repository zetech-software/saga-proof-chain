
## Feito — Assistente IA somente leitura (v1). Pendente: limpeza periódica de ai_question_usage antiga (não implementar sem aprovação)
- Deve funcionar para todos os clientes autorizados, não só Mariana e Léo.
- Responder apenas com dados que o próprio usuário pode acessar (RLS, organizações, compartilhamentos).
- Nunca consultar dados privados de outro cliente.
- Indicar claramente quando a resposta é gerada por IA.
- Não executar alterações no processo automaticamente.

## Feito — Melhorias operacionais do assistente (indicador de uso, relatório Admin, consumo atômico, comparação de modelos)
- Pendente de decisão do usuário: trocar o modelo para google/gemini-3.1-flash-lite (não trocado).

## Futuro — Help Desk externo (apenas registrado, NÃO implementado)
- Estratégia: IA no painel = 1º nível; Suporte atual = canal temporário simples; Help Desk externo = atendimento humano completo.
- Suporte atual não vira Help Desk (sem conversa contínua, filas, atribuição, "Em atendimento", automações).
- Futuro botão "Não encontrou o que precisava? [Falar com o suporte]" / "Precisa de atendimento humano? [Abrir atendimento]" apontando para o Help Desk. Sem URL, API ou integração até autorização.
- IA poderá sugerir "Não encontrei essa informação no seu processo. Se precisar, fale com nossa equipe de suporte." — sem abrir ticket, sem enviar conversa, contexto ou documentos.
- Histórico de perguntas/respostas da IA: NÃO guardar (Admin acompanha só o uso).
