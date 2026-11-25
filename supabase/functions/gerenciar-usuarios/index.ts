// Edge Function "gerenciar-usuarios" — permite que o MASTER crie usuários (vinculados a um município), redefina senhas e exclua usuários.
// Roda no servidor do Supabase (usa a chave service_role, que NUNCA vai para o site).
// Publicação: Supabase → Edge Functions → Deploy a new function → Via Editor → nome "gerenciar-usuarios" → colar este arquivo → Deploy.
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
    // chave pública (a mesma que o site usa; o supabase-js envia no cabeçalho "apikey") e chave de serviço do servidor
    const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY");
    // Se o projeto usa as chaves novas, crie o segredo SB_SECRET_KEY (veja o README); senão vale a service_role padrão.
    const service = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // 1) quem está chamando? (token do usuário logado)
    const caller = createClient(url, publica, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u, error: ue } = await caller.auth.getUser();
    if (ue || !u?.user) return json({ error: "Não autenticado" }, 401);

    // 2) é o master? Lido com a PRÓPRIA sessão de quem chamou (a regra de acesso deixa cada um ler o próprio perfil),
    //    sem depender da chave de serviço. Se a leitura falhar, o erro real é mostrado (não vira "você não é master").
    const { data: me, error: me_err } = await caller.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (me_err) return json({ error: "Não foi possível ler o seu perfil: " + me_err.message }, 500);
    if (me?.role !== "master") return json({ error: "Apenas o administrador geral (master) pode gerenciar usuários." }, 403);

    if (!service) return json({ error: "A chave de serviço não está disponível na função. Crie o segredo SB_SECRET_KEY (veja o README)." }, 500);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

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
        const { data: m, error: me2 } = await admin.from("municipios").select("id").eq("id", municipio_id).maybeSingle();
        if (me2) return json({ error: "Falha ao consultar o município: " + me2.message }, 500);
        if (!m) return json({ error: "Município não encontrado." }, 400);
      }

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome },
      });
      if (error) {
        const dup = /already|registered|exists/i.test(error.message);
        return json({ error: dup ? "Já existe um usuário com esse e-mail." : error.message }, dup ? 409 : 400);
      }
      // o gatilho já cria o perfil; aqui ajustamos nome, papel e município
      const { error: pe } = await admin.from("profiles").upsert({ id: data.user.id, nome, email, role, municipio_id });
      if (pe) return json({ error: "Usuário criado, mas falhou ajustar o perfil: " + pe.message }, 500);
      return json({ ok: true, id: data.user.id });
    }

    if (b.acao === "senha") {
      const password = String(b.password ?? "");
      if (!b.id) return json({ error: "Usuário não informado." }, 400);
      if (password.length < 8) return json({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (b.acao === "excluir") {
      if (!b.id) return json({ error: "Usuário não informado." }, 400);
      if (b.id === u.user.id) return json({ error: "Você não pode excluir a si mesmo." }, 400);
      const { error } = await admin.auth.admin.deleteUser(b.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: "Erro interno: " + (e?.message ?? e) }, 500);
  }
});
