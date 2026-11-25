// Configuração do Supabase (Project Settings → API).
// A "anon public key" é pública por desenho: quem protege os dados são as regras RLS do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "",       // ex.: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: ""   // ex.: "eyJhbGciOi..."
};
