# Validação de privacidade e modelo de acesso — relatório + próximos passos

## 1. Estado atual (verificado no banco)

Contas existentes (5):

| Conta | Cargos | Último acesso |
|---|---|---|
| mariana@zeregistra.com.br | cliente | 19/08 |
| leo@zeregistra.com.br | cliente | 18/08 |
| admin@zeregistra.com.br | cliente + admin | 19/08 |
| admin.teste@zeregistra.com.br | cliente + admin | hoje |
| cliente.teste@zeregistra.com.br | cliente | hoje |

Conteúdo real hoje: **0 marcas, 0 documentos, 0 certificados**; apenas 2 chamados de suporte (do Cliente Teste). Nada foi excluído — a base ainda não recebeu conteúdo de produção.

## 2. Como Mariana e Léo estão vinculados à Saga

**Não existe vínculo nenhum.** Não há organização, cliente, projeto ou equipe no banco. Marcas, documentos e certificados têm apenas `created_by` (autor do envio) e certificados nem isso — só ligação a documento/marca.

O acesso compartilhado dos dois existe hoje **por acesso global**: as regras de leitura de marcas, documentos e certificados são "qualquer usuário autenticado vê tudo". Ou seja, hoje o Cliente Teste (e qualquer cliente futuro) enxerga exatamente o mesmo que Mariana e Léo. É esse ponto que precisa ser corrigido — e ele não pode ser corrigido com isolamento por usuário, senão Mariana e Léo param de ver o conteúdo um do outro.

## 3. Validação da seção "Usuários e privacidade"

- Busca por nome/e-mail e ordenação (último acesso, nome, cadastro): funcionam sobre a lista real retornada pela função administrativa; nenhum dado é inventado.
- Contadores de envios: calculados por `created_by` de cada registro real carregado no painel. Hoje aparecem como 0/0 para todos e 2 chamados para o Cliente Teste — correto, porque não há marcas nem documentos cadastrados. Não há contagem global sendo exibida como se fosse individual.
- CSV: gerado só a partir da lista já visível ao admin, com separador `;`, BOM (abre certo no Excel) e aspas escapadas. Nenhuma informação além da que o admin já pode ver.
- Status da conta ("Minha conta"): vem de uma função que só devolve a linha do próprio usuário logado, **sem parâmetro de ID** — não há como pedir o status de outra pessoa trocando IDs na requisição.
- Função de atividade de usuários e resumo de privacidade: ambas exigem cargo admin e falham com "forbidden" para cliente e visitante; também não aceitam parâmetros manipuláveis.
- Perfis: leitura restrita ao próprio registro ou admin (corrigido na rodada anterior).

**Conclusão:** a seção implementada está correta e sem vazamento. A falha real é anterior a ela e está no modelo de acesso a marcas/documentos/certificados.

## 4. Falhas encontradas

1. **Crítica:** leitura global de marcas, documentos e certificados para qualquer cliente autenticado.
2. **Estrutural:** não existe ownership/compartilhamento — nem organização, nem coluna de titular em certificados.
3. Certificados não têm autor nem vínculo direto a um titular; dependem do documento/marca.

## 5. Solução mínima proposta (a confirmar antes de executar)

Modelo de "titular" (organização), sem duplicar dados:

```text
organizations            (Saga Mitologia Cósmica, e futuros clientes)
organization_members     (usuário -> organização)   Mariana, Léo, admins
trademarks/documents     ganham organization_id
certificates             herdam via documento/marca
resource_shares          exceções pontuais criadas pelo admin
```

Regras de leitura resultantes:
- admin: tudo;
- membro de uma organização: todo o conteúdo daquela organização (preserva 100% o acesso conjunto de Mariana e Léo);
- demais clientes: apenas o que criaram, o que é da sua organização, ou o que o admin compartilhou explicitamente;
- visitante: nada.

Migração de dados: criar a organização Saga, incluir Mariana, Léo e os admins como membros, e vincular todo conteúdo existente a ela (hoje: nenhum registro, migração sem risco). Nenhuma conta, credencial ou cargo é alterado.

## 6. Recomendações sobre as demais sugestões

- **Painel de privacidade completo — implementar depois do modelo acima.** Só faz sentido quando existir ownership e compartilhamento reais: aí ele mostra usuário, recursos próprios, recursos compartilhados, com quem, regra aplicada e inconsistências (item sem titular, compartilhamento órfão). Hoje seria tela estática — o resumo atual já basta como diagnóstico.
- **Edição de marcas pelo admin — recomendo implementar**, com formulário que só edita dados da marca (nome, titular, classe, segmento, status, protocolo, observações) e nunca titularidade/compartilhamento, que passam a ter ação própria e exclusiva do admin.
- **Documentos completo — recomendo implementar** upload, download, substituição, exclusão e definição de acesso, respeitando as permissões acima. Já existem upload/download e URLs assinadas; falta substituição, exclusão e controle de acesso.
- **Notificações de novo acesso — não implementar por enquanto.** Verificado: o log de auditoria de autenticação está vazio (sem retenção utilizável) e não há forma confiável no app de distinguir login real de renovação de token e recarregamento de página. O único sinal confiável é a data de último acesso, que muda apenas em login real — mas isso serve para relatório, não para notificação em tempo real. Recomendo manter só o relatório de acessos já existente.

## 7. Riscos de regressão

- Ativar isolamento sem o modelo de organização quebraria a visão conjunta de Mariana e Léo — por isso a mudança de regras e a criação da organização precisam ir na mesma migração.
- Certificados dependem do vínculo com documento/marca: um certificado sem os dois ficaria invisível para clientes; o painel do admin trata esse caso como inconsistência.
- Nada será aplicado no banco sem sua confirmação.

## Próximo passo

Confirmar o modelo de organização da seção 5. Com o "ok", executo em uma única migração (organização Saga + membros + vínculos + novas regras) e só depois sigo para edição de marcas e documentos completo.
