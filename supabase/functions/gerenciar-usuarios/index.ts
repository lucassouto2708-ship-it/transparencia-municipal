// Edge Function "gerenciar-usuarios" — permite que o MASTER crie usuários (vinculados a um município), redefina senhas e exclua usuários.
// Publicação: Supabase → Edge Functions → Deploy a new function → Via Editor → nome "gerenciar-usuarios" → colar este arquivo → Deploy.
//
// Como funciona (e por que é robusto):
//  • Toda leitura/gravação nas TABELAS é feita com a sessão do próprio master que chamou (as regras RLS do schema.sql
//    já permitem isso). Não depende de permissões do papel service_role nas tabelas.
//  • A chave de serviço é usada SOMENTE na API de autenticação (criar usuário, trocar senha, excluir) — que não usa as tabelas.
//    Ela nunca vai para o site.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["master", "municipio"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");          // a mesma chave pública do site
    const service = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // só para a API de autenticação

    // 1) quem está chamando? (sessão do usuário logado) — todo acesso a tabelas usa este cliente
    const db = createClient(url, publica, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: ue } = await db.auth.getUser();
    if (ue || !u?.user) return json({ error: "Não autenticado. Entre de novo no site." }, 401);

    // 2) é o master?
    const { data: me, error: meErr } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (meErr) return json({ error: "Não foi possível ler o seu perfil: " + meErr.message }, 500);
    if (me?.role !== "master") return json({ error: "Apenas o administrador geral (master) pode gerenciar usuários." }, 403);

    if (!service) return json({ error: "A chave de serviço não está disponível na função. Crie o segredo SB_SECRET_KEY (veja o README)." }, 500);
    const authAdmin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

    const b = await req.json().catch(() => ({}));

    if (b.acao === "criar") {
      const email = String(b.email ?? "").trim().toLowerCase();
      const nome = String(b.nome ?? "").trim();
      const password = String(b.password ?? "");
      const role = ROLES.includes(b.role) ? b.role : "municipio";
      const municipio_id = role === "municipio" ? Number(b.municipio_id) || null : null;
      if (!nome) return json({ error: "Informe o nome." }, 400);
      if (!EMAIL.test(email)) return json({ error: "E-mail inválido." }, 400);
      if (password.length < 8) return json({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);
      if (role === "municipio") {
        if (!municipio_id) return json({ error: "Escolha o município do usuário." }, 400);
        const { data: m, error: mErr } = await db.from("municipios").select("id").eq("id", municipio_id).maybeSingle();
        if (mErr) return json({ error: "Falha ao consultar o município: " + mErr.message }, 500);
        if (!m) return json({ error: "Município não encontrado." }, 400);
      }

      const { data, error } = await authAdmin.createUser({ email, password, email_confirm: true, user_metadata: { nome } });
      if (error) {
        const dup = /already|registered|exists/i.test(error.message);
        return json({ error: dup ? "Já existe um usuário com esse e-mail." : "Falha ao criar o login: " + error.message }, dup ? 409 : 400);
      }
      // o gatilho do banco já criou o perfil; o master ajusta nome, papel e município (permitido pelas regras RLS)
      const { data: upd, error: pe } = await db.from("profiles").update({ nome, role, municipio_id }).eq("id", data.user.id).select("id");
      if (pe || !upd?.length) {
        await authAdmin.deleteUser(data.user.id);   // desfaz: não deixa login sem perfil correto
        return json({ error: "Falha ao configurar o perfil do usuário" + (pe ? ": " + pe.message : " (perfil não encontrado — rode o schema.sql).") + " Nada foi criado." }, 500);
      }
      return json({ ok: true, id: data.user.id });
    }

    if (b.acao === "senha") {
      const password = String(b.password ?? "");
      if (!b.id) return json({ error: "Usuário não informado." }, 400);
      if (password.length < 8) return json({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);
      const { error } = await authAdmin.updateUserById(b.id, { password });
      if (error) return json({ error: "Falha ao trocar a senha: " + error.message }, 400);
      return json({ ok: true });
    }

    if (b.acao === "excluir") {
      if (!b.id) return json({ error: "Usuário não informado." }, 400);
      if (b.id === u.user.id) return json({ error: "Você não pode excluir a si mesmo." }, 400);
      const { error } = await authAdmin.deleteUser(b.id);
      if (error) return json({ error: "Falha ao excluir: " + error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: "Erro interno: " + (e?.message ?? e) }, 500);
  }
});
