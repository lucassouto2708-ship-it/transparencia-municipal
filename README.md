# Checklist Transparência Municipal

Checklist para acompanhar os critérios da ficha do **Radar da Transparência Pública** (Atricon), com **uma ficha separada por município**.

- **Front:** site estático (HTML + JS puro) publicado no **GitHub Pages**.
- **Back:** **Supabase** (login, banco Postgres, regras de acesso, tempo real e uma função para criar usuários). Não há servidor para manter.

```
index.html · app.js · style.css · config.js          ← site (GitHub Pages)
supabase/schema.sql                                  ← tabelas, regras de acesso (RLS) e gatilhos
supabase/functions/gerenciar-usuarios/index.ts       ← função que permite ao master criar/excluir usuários
dados/modelo-ficha.csv                               ← modelo do CSV da ficha (formato aceito no "Importar CSV")
```

## Quem pode o quê

| | **Master** (você) | **Usuário de município** |
|---|---|---|
| Vê | todos os municípios | **só o próprio município** |
| Cria/exclui municípios e usuários, muda senhas | sim | **não** |
| Importa o CSV da ficha | sim (em qualquer município) | sim, **só no dele** |
| Marca o checklist (letras D A S G F, status, notas…) | sim | sim, **só no dele** |
| Zera/apaga a ficha | sim | sim, **só a dele** |
| Alterar a própria senha e nome | sim | sim |

O isolamento entre municípios é garantido **no banco** (RLS do Postgres), não só na tela: mesmo quem chamasse a API direto não lê nem altera os dados de outro município.
Cada município importa o **próprio CSV** e pode usar o mesmo ciclo e a mesma numeração dos outros sem conflito.

## Como funciona

- O app **chega zerado**: sem critérios. O usuário do município importa o CSV da ficha (**Importar CSV**) e cada critério vira um item do checklist.
- Cada critério tem as letras **D A S G F** (Disponibilidade, Atualidade, Série histórica, Gravação, Filtros). Clique na letra para alternar **verde (atende) / vermelho (não atende)**. Letras **cinza** ("não se aplica" na validação) são travadas.
- O **status** acompanha as letras: todas as aplicáveis verdes ⇒ *Concluído*; reabrir uma letra ⇒ *Em andamento*.
- Cada critério ainda tem responsável, prazo, notas, link da correção e **histórico** de quem mudou o quê.
- Alterações aparecem para os usuários **do mesmo município** em tempo real. O tema padrão é claro (há botão para o escuro).
- Se importou o CSV errado: menu → **Zerar ou apagar ficha…** → *Apagar a ficha importada* e importe de novo.

## Publicar em 6 passos

### 1) Criar o projeto no Supabase
Entre em <https://supabase.com>, crie um projeto e guarde a senha do banco.

### 2) Criar as tabelas
**SQL Editor → New query**, cole **todo** o `supabase/schema.sql` e clique em **Run**.
O script serve para instalar do zero **e** para atualizar um banco que já usava a versão anterior (idempotente).
> Ao atualizar a versão antiga (ficha única), a ficha antiga é **removida** (ela não pertencia a nenhum município) e o app passa a chegar zerado.
> Os usuários continuam: o primeiro vira **master**; os demais ficam sem município até você vincular.

### 3) Configurar o site
Em **Project Settings → API Keys** copie a **Project URL** e a chave **anon / publishable** para o `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_... ou eyJ..."
};
```

> Essa chave é pública por desenho: quem protege os dados são as regras RLS do `schema.sql`. **Nunca** use a chave `secret` / `service_role` no site.

### 4) Publicar no GitHub Pages
**Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.**
No Supabase, em **Authentication → URL Configuration**, coloque a URL do site em **Site URL** e em **Redirect URLs** (usada no "esqueci a senha").

### 5) Publicar a função que cria usuários
1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `gerenciar-usuarios` (exatamente assim).
3. Apague o exemplo, cole **todo** o `supabase/functions/gerenciar-usuarios/index.ts` e clique em **Deploy function**.

(Se já tinha publicado a versão anterior, **substitua o código** pelo atual e faça Deploy de novo.)

**Se ao criar usuário aparecer erro de chave** (por exemplo *Invalid API key* ou *chave de serviço não está disponível*): o seu projeto usa as chaves novas do Supabase. Crie o segredo da função:
1. **Project Settings → API Keys** → crie/copie a chave **secret** (`sb_secret_...`). Ela **nunca** vai no site, só aqui.
2. **Edge Functions → Secrets → Add new secret**: nome `SB_SECRET_KEY`, valor = a chave secret. Salve (não precisa publicar de novo).

### 6) Primeiro acesso e cadastro dos municípios
1. **Seu usuário master:** o primeiro usuário do projeto vira master automaticamente. Num projeto novo, crie-o em **Authentication → Users → Add user → Create new user** (marque *Auto Confirm User*).
2. Entre no site: você cai no **Painel de municípios**. Clique em **Novo município** (ex.: *Mathias Lobato / MG*).
3. Clique no ícone de usuários do município (ou **Usuários** no topo) → **Novo usuário**: nome, e-mail, senha inicial e o município. Repita para cada município.
4. Passe o link e a senha para cada município. Ele entra direto na própria ficha, clica em **Importar CSV** e começa a marcar.
5. Recomendado: em **Authentication → Providers → Email**, desligue **Allow new users to sign up** (só você cria contas). O site não tem tela de cadastro.

## Formato do CSV

Separador `;` e as colunas:
`ciclo, dimensao, criterio, exigibilidade, Disponibilidade, Atualidade, Série Histórica, Gravação de Relatórios, Filtros de Pesquisa, autoavaliacao, evidencia`
(veja `dados/modelo-ficha.csv`). Cada letra vale `atende`, `não atende` ou `não se aplica`; o critério começa com o número (`1.1 Possui…`).
Importar de novo atualiza os critérios de mesmo número **mantendo o andamento**. Quando há mais de um ciclo, aparece um seletor no cabeçalho.

## Desenvolvimento local

É um site estático: basta servir a pasta (`python3 -m http.server`) e abrir `http://localhost:8000`, com o `config.js` preenchido.
