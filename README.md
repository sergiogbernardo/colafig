# ColaFig

**Cole, acompanhe, complete.**

Plataforma de organização de álbuns de figurinhas instalável no celular.
Permite criar uma conta, escolher álbuns em um catálogo curado, marcar
figurinhas, controlar repetidas e acompanhar o progresso de cada coleção. A
biblioteca e as cadernetas exigem uma sessão válida do Supabase Auth. Enquanto
o catálogo ainda não foi carregado no PostgreSQL, a biblioteca e cada coleção
são armazenadas no navegador e isoladas pelo ID do usuário; a sincronização
entre dispositivos é a próxima etapa.

O primeiro item do catálogo acompanha a estrutura de 980 figurinhas da coleção 2026:
20 especiais e 20 para cada uma das 48 seleções. O ColaFig usa apenas códigos,
nomes e elementos visuais próprios; scans e imagens oficiais não são incluídos.

O ColaFig é um projeto independente e não possui vínculo com fabricantes de
álbuns ou organizações esportivas. A interface usa formas e elementos originais;
imagens, scans, marcas e layouts oficiais não devem ser adicionados ao repositório.

## Tecnologias

- React, TypeScript e Vite;
- GitHub Pages;
- PWA com app shell offline;
- Supabase Auth e PostgreSQL com RLS (integração preparada para múltiplos álbuns).

## Desenvolvimento

Requer Node.js 22.13 ou posterior.

```bash
npm install
npm run dev
```

O Vite mostrará o endereço de desenvolvimento. As mudanças da coleção são
salvas em uma chave de `localStorage` exclusiva para cada usuário autenticado.

## Supabase

Copie `.env.example` para `.env.local` e preencha somente a URL e a chave
**publishable** do projeto:

```dotenv
VITE_SUPABASE_URL=https://project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Nunca use no frontend a chave `service_role`, uma secret key, a senha do banco
ou uma connection string.

A migração inicial está em `supabase/migrations/`. Ela cria o catálogo, os
perfis e as coleções, ativa RLS em todas as tabelas e aplica políticas de
propriedade com `auth.uid()`.

A migração multiálbum adiciona `user_albums`, metadados editoriais ao catálogo
e restringe leituras públicas a álbuns publicados. Escritas no catálogo não
são concedidas aos papéis usados pelo navegador.

O frontend oferece cadastro com confirmação de e-mail, login por e-mail e
senha, recuperação de senha e encerramento de sessão. A URL de confirmação e
recuperação deve permanecer autorizada no painel do Supabase Auth.

Antes de aplicar a migração em produção:

1. revisar o SQL;
2. executar em um projeto Supabase de desenvolvimento;
3. testar acessos anônimo, usuário A e usuário B;
4. confirmar que um usuário nunca lê ou altera a coleção de outro.

## GitHub Pages

O workflow `.github/workflows/deploy.yml` publica `dist` a cada push em `main`.
No repositório do GitHub:

1. configure Pages com **GitHub Actions** como fonte;
2. crie as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em
   **Settings → Secrets and variables → Actions → Variables**;
3. no Supabase Auth, configure a URL de produção exata:
   `https://sabion.io/colafig/`.
