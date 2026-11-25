// Configuração do Supabase (Project Settings → API Keys).
// A chave "publishable" (anon) é pública por desenho: quem protege os dados são as regras RLS do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave "secret" / "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "https://cvyfjpvicknzrncpzzpt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable__bh7_BxE6joFS728wJCz1Q_61VgdvPz"
};
