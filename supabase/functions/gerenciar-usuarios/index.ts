// Edge Function "gerenciar-usuarios" — permite que um ADMINISTRADOR crie usuários, redefina senhas e exclua usuários.
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

const ROLES = ["admin", "editor", "viewer"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // 1) quem está chamando? (token do usuário logado)
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u, error: ue } = await caller.auth.getUser();
    if (ue || !u?.user) return json({ error: "Não autenticado" }, 401);

    // 2) é administrador?
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (me?.role !== "admin") return json({ error: "Apenas administradores podem gerenciar usuários." }, 403);

    const b = await req.json().catch(() => ({}));

    if (b.acao === "criar") {
      const email = String(b.email ?? "").trim().toLowerCase();
      const nome = String(b.nome ?? "").trim();
      const password = String(b.password ?? "");
      const role = ROLES.includes(b.role) ? b.role : "viewer";
      if (!nome) return json({ error: "Informe o nome." }, 400);
      if (!EMAIL.test(email)) return json({ error: "E-mail inválido." }, 400);
      if (password.length < 8) return json({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome },
      });
      if (error) {
        const dup = /already|registered|exists/i.test(error.message);
        return json({ error: dup ? "Já existe um usuário com esse e-mail." : error.message }, dup ? 409 : 400);
      }
      // o gatilho já cria o perfil (como "viewer"); aqui ajustamos nome e papel
      const { error: pe } = await admin.from("profiles").upsert({ id: data.user.id, nome, email, role });
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
