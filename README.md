# Checklist Transparência Municipal

Checklist colaborativo para a equipe trabalhar, em conjunto, nos critérios da ficha do **Radar da Transparência Pública** (Atricon).

- **Front:** site estático (HTML + JS puro) publicado no **GitHub Pages**.
- **Back:** **Supabase** (login, banco Postgres, regras de acesso e tempo real). Não há servidor para manter.

```
index.html · app.js · style.css · config.js     ← site (GitHub Pages)
supabase/schema.sql                             ← tabelas, regras de acesso (RLS) e gatilhos
supabase/seed.sql                               ← carga da ficha 2026 (96 critérios)
dados/ficha-2026.csv                            ← a ficha original (formato aceito no "Importar CSV")
```

## Como funciona

- Cada critério tem as letras **D A S G F** (Disponibilidade, Atualidade, Série histórica, Gravação, Filtros). Clique na letra para alternar **verde (atende) / vermelho (não atende)**. Letras **cinza** ("não se aplica" na validação) são travadas.
- O **status** acompanha as letras: todas as aplicáveis verdes ⇒ *Concluído*; reabrir uma letra ⇒ *Em andamento*.
- Cada critério ainda tem responsável, prazo, notas, link da correção e **histórico** de quem mudou o quê.
- Tudo é salvo na hora e **aparece para a equipe em tempo real**.
- Perfis: **Administrador** (importa CSV, zera o progresso, gerencia usuários) · **Editor** (altera o checklist) · **Somente leitura**.

## Publicar em 4 passos

### 1) Criar o projeto no Supabase
1. Entre em <https://supabase.com>, crie um projeto e guarde a senha do banco.
2. Abra **SQL Editor → New query**, cole **todo** o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em outra query, cole `supabase/seed.sql` e clique em **Run** (carrega os 96 critérios de 2026).
   Os dois scripts podem ser executados de novo sem duplicar nada.

### 2) Configurar o site
Em **Project Settings → API** copie a **Project URL** e a **anon public key** para o `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

> A *anon key* é pública por desenho: quem protege os dados são as regras RLS do `schema.sql`
> (sem login, nada é lido ou gravado). **Nunca** use a chave `service_role` no site.

### 3) Publicar no GitHub Pages
No repositório: **Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.**
Em ~1 minuto o site fica em `https://SEU-USUARIO.github.io/transparencia-municipal/`.

### 4) Liberar o login para o endereço do site
No Supabase: **Authentication → URL Configuration**
- **Site URL:** `https://SEU-USUARIO.github.io/transparencia-municipal/`
- **Redirect URLs:** adicione a mesma URL (é usada nos e-mails de confirmação e de "esqueci a senha").

## Primeiro acesso e equipe

1. Abra o site e use **Criar conta**. **O primeiro usuário vira Administrador automaticamente.**
2. As demais pessoas criam a própria conta e entram como *Somente leitura*; o administrador abre **Usuários** e muda para **Editor** (ou Administrador).
3. Se preferir não ter cadastro aberto: **Authentication → Providers → Email → desative *Allow new users to sign up*** e convide as pessoas em **Authentication → Users → Invite user** (o perfil é criado do mesmo jeito).
4. Se o e-mail de confirmação atrapalhar (limite de envios do plano gratuito), desative *Confirm email* em **Authentication → Providers → Email**.

## Outros ciclos / nova ficha

Logado como administrador, clique em **Importar CSV** e escolha a ficha (mesmo formato de `dados/ficha-2026.csv`: separador `;`, colunas
`ciclo, dimensao, criterio, exigibilidade, Disponibilidade, Atualidade, Série Histórica, Gravação de Relatórios, Filtros de Pesquisa, autoavaliacao, evidencia`).
Critérios com o mesmo número no mesmo ciclo são atualizados **mantendo o andamento**; os novos começam pelo resultado da validação.
Quando há mais de um ciclo, aparece um seletor no cabeçalho.

## Segurança (resumo do que o banco garante)

| Quem | Lê | Altera andamento | Altera critérios/importa | Muda perfis |
|---|---|---|---|---|
| Sem login | — | — | — | — |
| Somente leitura | sim | não | não | não |
| Editor | sim | sim | não | não |
| Administrador | sim | sim | sim | sim |

Ninguém consegue promover a si mesmo. Excluir um usuário é feito no painel do Supabase (*Authentication → Users*).

## Desenvolvimento local

É um site estático: basta servir a pasta (`python3 -m http.server`) e abrir `http://localhost:8000`, com o `config.js` preenchido.
