# Auditoria de privacidade da tabela de perfis

## O que a auditoria encontrou (verificado agora)

**Exposição confirmada:** a tabela `profiles` tem uma regra de leitura `profiles_select_authenticated` com condição `true` para qualquer usuário autenticado. Na prática, qualquer cliente logado (Mariana, Léo, cliente de teste) pode listar **nome e e-mail de todos os usuários** da plataforma através da API do backend, mesmo sem nenhuma tela oferecer isso. Isso permite enumeração de usuários (listar quem existe na plataforma).

**Dependências mapeadas — nenhuma leitura ampla é necessária:**
- Nenhum componente, hook, rota ou query do app lê `profiles`. A busca no código inteiro não retorna nenhuma leitura dessa tabela.
- A seção "Atividade de acesso dos usuários" não lê `profiles` diretamente: usa a função segura `admin_list_user_activity()`, que roda com privilégios próprios e já bloqueia quem não é admin. Ela continua funcionando mesmo com a leitura restrita.
- O cadastro automático de perfil no primeiro login usa uma função com privilégios próprios (gravação), não afetada por regra de leitura.
- `user_roles` já está correto: cada usuário só enxerga os próprios cargos; a checagem de admin usa função com privilégios próprios.
- Usuários não autenticados já não conseguem ler nada de `profiles` nem de `user_roles` (não existe regra para visitantes anônimos).

**Sem exposição indireta adicional:** as demais telas leem marcas, documentos, certificados, suporte e notificações — nenhuma delas devolve dados de perfil de terceiros. O risco está apenas no acesso direto à API com a sessão do cliente.

## Correção proposta (mínima)

Substituir a regra de leitura de `profiles` por uma equivalente restrita:

- Cliente: enxerga **apenas o próprio perfil**.
- Admin: continua enxergando todos os perfis (via checagem de cargo já existente), preservando o painel administrativo.
- Regra de atualização do próprio perfil: mantida sem alteração.
- Nada de credenciais, usuários, cargos, dados ou outras tabelas é alterado.

## Detalhes técnicos

Migração única, apenas em `public.profiles`:

```sql
DROP POLICY "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
```

Nenhum arquivo de código precisa mudar (nenhum consumo de `profiles` no front-end). Nenhuma função/RPC é alterada — `admin_list_user_activity()` é `SECURITY DEFINER` e segue intacta.

## Testes após a correção

Via navegador (Playwright) contra o preview:
1. Login admin e login cliente.
2. Acesso direto a `/painel/admin` como cliente (deve redirecionar).
3. Tentativa, com a sessão do cliente, de ler `profiles` de outro usuário pela API — deve retornar vazio.
4. Mesma tentativa com a sessão admin — deve continuar retornando os perfis.
5. Painel de usuários e "Atividade de acesso dos usuários" (tabela, filtros, contagens).
6. Marcas, documentos, certificados, suporte e notificações como cliente.
7. Login/logout, refresh da sessão.
8. Desktop e 390 px; console e Network sem erros.

Ao final: relatório com vulnerabilidade, policy anterior, policy nova, arquivos alterados, funções tocadas, testes executados e confirmação dos dois cenários (cliente bloqueado, admin funcionando).
