# Checklist Transparência Municipal

Checklist colaborativo para a equipe trabalhar, em conjunto, nos critérios da ficha do **Radar da Transparência Pública** (Atricon).

- **Front:** site estático (HTML + JS puro) publicado no **GitHub Pages**.
- **Back:** **Supabase** (login, banco Postgres, regras de acesso, tempo real e uma função para criar usuários). Não há servidor para manter.

```
index.html · app.js · style.css · config.js          ← site (GitHub Pages)
supabase/schema.sql                                  ← tabelas, regras de acesso (RLS) e gatilhos
supabase/functions/gerenciar-usuarios/index.ts       ← função que permite ao admin criar/excluir usuários
dados/modelo-ficha.csv                               ← modelo do CSV da ficha (formato aceito no "Importar CSV")
```

## Como funciona

- **O app chega zerado**: não há critério nenhum. O administrador importa o CSV da ficha (botão **Importar CSV**) e cada critério vira um item do checklist.
- Cada critério tem as letras **D A S G F** (Disponibilidade, Atualidade, Série histórica, Gravação, Filtros). Clique na letra para alternar **verde (atende) / vermelho (não atende)**. Letras **cinza** ("não se aplica" na validação) são travadas.
- O **status** acompanha as letras: todas as aplicáveis verdes ⇒ *Concluído*; reabrir uma letra ⇒ *Em andamento*.
- Cada critério ainda tem responsável, prazo, notas, link da correção e **histórico** de quem mudou o quê.
- Tudo é salvo na hora e **aparece para a equipe em tempo real**. O tema padrão é claro (há botão para o escuro).
- Perfis: **Administrador** (importa CSV, zera/apaga a ficha, cria e gerencia usuários) · **Editor** (altera o checklist) · **Somente leitura**.

> Os dados são **compartilhados por projeto Supabase**: todos os usuários enxergam a mesma ficha. Para outro município/equipe com ficha própria, use outro projeto Supabase (e outro `config.js`).

## Publicar em 6 passos

### 1) Criar o projeto no Supabase
Entre em <https://supabase.com>, crie um projeto e guarde a senha do banco.

### 2) Criar as tabelas
Abra **SQL Editor → New query**, cole **todo** o conteúdo de `supabase/schema.sql` e clique em **Run**.
(Pode ser executado de novo sem perder dados. **Não há carga de dados**: a ficha é importada pelo app.)

### 3) Configurar o site
Em **Project Settings → API Keys** copie a **Project URL** e a chave **anon / publishable** para o `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_... ou eyJ..."
};
```

> Essa chave é pública por desenho: quem protege os dados são as regras RLS do `schema.sql`
> (sem login, nada é lido ou gravado). **Nunca** use a chave `secret` / `service_role` no site.

### 4) Publicar no GitHub Pages
No repositório: **Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.**
O site fica em `https://SEU-USUARIO.github.io/transparencia-municipal/`.
No Supabase, em **Authentication → URL Configuration**, coloque essa URL em **Site URL** e em **Redirect URLs**.

### 5) Publicar a função que cria usuários
É o que permite ao administrador **criar usuários direto no app** (a chave de serviço fica só no servidor do Supabase).

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Nome da função: `gerenciar-usuarios` (exatamente assim).
3. Apague o exemplo, cole **todo** o conteúdo de `supabase/functions/gerenciar-usuarios/index.ts` e clique em **Deploy function**.

Sem esse passo o app funciona normalmente; só o botão "Criar usuário" mostra um aviso de que a função não foi publicada
(as pessoas ainda podem criar a própria conta pela tela de login, e o admin ajusta o perfil).

### 6) Primeiro acesso
1. Abra o site, clique em **Criar conta** e use a sua. **O primeiro usuário vira Administrador automaticamente.**
2. Se o e-mail de confirmação atrapalhar, desligue **Confirm email** em **Authentication → Providers → Email**.
3. Clique em **Importar CSV** e escolha a ficha (use **Baixar modelo de CSV** para ver o formato).
4. Abra o menu (seu nome, no canto) → **Usuários** → **Novo usuário** para cadastrar a equipe (nome, e-mail, senha inicial e perfil).

## Formato do CSV

Separador `;` e as colunas:
`ciclo, dimensao, criterio, exigibilidade, Disponibilidade, Atualidade, Série Histórica, Gravação de Relatórios, Filtros de Pesquisa, autoavaliacao, evidencia`
(veja `dados/modelo-ficha.csv`). Cada letra vale `atende`, `não atende` ou `não se aplica`; o critério começa com o número (`1.1 Possui…`).

Importar de novo atualiza os critérios de mesmo número **mantendo o andamento**. Quando há mais de um ciclo, aparece um seletor no cabeçalho.
Para recomeçar: menu → **Zerar ou apagar ficha…** (limpar progresso, voltar ao resultado do CSV ou apagar a ficha inteira).

## Segurança (o que o banco garante)

| Quem | Lê | Altera andamento | Importa/apaga ficha | Gerencia usuários |
|---|---|---|---|---|
| Sem login | — | — | — | — |
| Somente leitura | sim | não | não | não |
| Editor | sim | sim | não | não |
| Administrador | sim | sim | sim | sim |

Ninguém consegue promover a si mesmo. A função `gerenciar-usuarios` confere no servidor que quem chama é administrador.

## Desenvolvimento local

É um site estático: basta servir a pasta (`python3 -m http.server`) e abrir `http://localhost:8000`, com o `config.js` preenchido.
