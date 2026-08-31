# Atividade de acesso dos usuários (área Admin)

## O que já existe (verificado)

- Login por e-mail/senha em `/auth`, sessão gerenciada pelo Cloud (persistida no navegador), rotas protegidas por `_authenticated` com redirecionamento para `/auth`.
- Perfis em `profiles` (nome/e-mail) e cargos em `user_roles` (`admin` / `cliente`), com `has_role()` para checagens seguras.
- Os dados reais de login (data de cadastro e último acesso) vivem na tabela de autenticação do Cloud (`created_at`, `last_sign_in_at`). Hoje **não existe nenhuma tela** que mostre isso — nada será inventado ou simulado.
- Consulta atual confirma 5 contas, sem duplicidade de e-mail e todas com perfil e cargo corretos.

## O que será implementado

Nova seção **"Acessos"** dentro do painel administrativo (`/painel/admin`), visível apenas para administradores, com uma tabela contendo:

- Nome, e-mail e cargo (Administrador / Cliente)
- Data de cadastro
- Data e hora do último acesso (fuso de São Paulo, UTC-3)
- Há quantos dias foi o último acesso ("hoje", "há 3 dias", etc.)
- "Nunca acessou" destacado quando não há registro de login

Filtros rápidos (botões): Todos · Acessaram hoje · Últimos 7 dias · Últimos 15 dias · Últimos 30 dias · Mais de 30 dias sem acessar · Nunca acessaram — cada um com a contagem de usuários.

Estados de carregamento, lista vazia e erro amigável seguindo os padrões já usados no portal, e layout responsivo (cartões em telas pequenas, tabela no desktop).

## Auditoria e correções

Serão revisados e corrigidos apenas defeitos reais e seguros, sem mudar regra de negócio:

- Login/logout, expiração e persistência de sessão, redirecionamento pós-login.
- Controle de acesso por cargo: hoje `/painel/admin` renderiza um aviso "área restrita" para não-admin em vez de redirecionar (a rota de Suporte já redireciona). Padronizar o comportamento, mantendo a regra atual de quem pode ver o quê.
- Datas/fuso: padronizar a formatação em pt-BR / America/Sao_Paulo na nova área.
- Verificação de erros de console, requisições com falha, loadings infinitos, filtros e botões, e sobras de código antigo/duplicado ligadas a autenticação.

Achados de segurança encontrados na auditoria (ex.: leitura ampla da tabela de perfis por qualquer usuário autenticado) serão **reportados no resumo final**, não alterados sem sua autorização.

## Detalhes técnicos

- Nova função no banco `public.admin_list_user_activity()` (`SECURITY DEFINER`, `search_path = public`) que retorna id, nome, e-mail, cargos, `created_at` e `last_sign_in_at` lendo a tabela de autenticação, com `EXECUTE` concedido a `authenticated` e bloqueio interno `if not has_role(auth.uid(),'admin') then raise exception`. É a única alteração de banco; nenhuma tabela, policy, credencial, usuário ou permissão existente é modificada.
- Frontend: novo componente da seção de acessos + hook de consulta via React Query (`enabled` somente para admin), reaproveitando `Card`, `Button`, `StatusBadge`, `EmptyState`, `ListSkeleton` e `RouteErrorState`.
- Validação final no navegador com as contas admin e cliente existentes (sem criar contas), conferindo login, permissões, filtros, responsividade em 390 px e ausência de erros de console, além de typecheck/lint.
