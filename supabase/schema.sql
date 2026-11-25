-- =====================================================================
--  Checklist Transparência Municipal — esquema do banco (Supabase/Postgres)
--  Cole este arquivo inteiro no SQL Editor do Supabase e clique em RUN.
--  É idempotente: serve para instalar do zero E para atualizar um banco já existente.
--
--  Modelo de acesso (multi-município):
--    • master    → você: vê e controla tudo (municípios, usuários, qualquer ficha).
--    • municipio → usuário de UM município: só vê a ficha do próprio município e só pode
--                  importar o CSV, marcar o checklist e zerar a ficha do seu município.
--  O isolamento entre municípios é garantido aqui, no banco (RLS), e não só na tela.
-- =====================================================================

-- ---------- Municípios ----------
create table if not exists public.municipios (
  id         bigint generated always as identity primary key,
  nome       text not null,
  uf         text,
  created_at timestamptz not null default now()
);
create unique index if not exists municipios_nome_uk on public.municipios (lower(nome));

-- ---------- Perfis (1 por usuário do Supabase Auth) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text,
  role       text not null default 'municipio',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists municipio_id bigint references public.municipios(id) on delete set null;
-- migração dos papéis antigos: admin → master; editor/viewer → municipio (sem município até o master vincular)
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = case when role in ('admin','master') then 'master' else 'municipio' end;
alter table public.profiles add constraint profiles_role_check check (role in ('master','municipio'));
alter table public.profiles alter column role set default 'municipio';

-- funções auxiliares (SECURITY DEFINER evita recursão nas políticas de RLS)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.my_municipio() returns bigint
language sql stable security definer set search_path = public as $$
  select municipio_id from public.profiles where id = auth.uid()
$$;
create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'master' from public.profiles where id = auth.uid()), false)
$$;

-- ao criar um usuário: cria o perfil. O PRIMEIRO usuário vira master; os demais entram como "municipio"
-- sem município (não enxergam nada) até o master vinculá-los a um município (a tela Usuários faz isso).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'municipio' else 'master' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- perfis de usuários que já existiam antes deste script (o 1º vira master)
insert into public.profiles (id, nome, email, role)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)), u.email,
       case when row_number() over (order by u.created_at) = 1
                 and not exists (select 1 from public.profiles) then 'master' else 'municipio' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------- Critérios (a ficha importada de cada município) ----------
create table if not exists public.criteria (
  id            bigint generated always as identity primary key,
  ciclo         int  not null,
  ordem         int  not null,
  dimensao      text not null,
  num           text not null,                 -- ex.: '6.7'
  criterio      text not null,
  exigibilidade text not null,                 -- Essencial | Obrigatória | Recomendada
  disp          text, atual text, serie text, grav text, filtros text,   -- atende | não atende | não se aplica
  evidencias    text[] not null default '{}'
);
alter table public.criteria add column if not exists municipio_id bigint references public.municipios(id) on delete cascade;
-- dados antigos (de quando a ficha era única para todos) não pertencem a nenhum município: saem.
-- A ficha agora é importada por cada município.
delete from public.criteria where municipio_id is null;
alter table public.criteria alter column municipio_id set not null;
alter table public.criteria drop constraint if exists criteria_ciclo_num_key;
create unique index if not exists criteria_mun_ciclo_num_uk on public.criteria (municipio_id, ciclo, num);

-- ---------- Andamento de cada critério ----------
create table if not exists public.tasks (
  criterio_id     bigint primary key references public.criteria(id) on delete cascade,
  status          text not null default 'pendente' check (status in ('pendente','andamento','concluido','na')),
  responsavel_id  uuid references public.profiles(id) on delete set null,
  prazo           date,
  notas           text not null default '',
  link            text not null default '',
  -- ajustes manuais das letras D A S G F: 'D:g,A:r'  (g = atende/verde, r = não atende/vermelho)
  sub_state       text not null default '' check (sub_state ~ '^([DASGF]:[gr])?(,[DASGF]:[gr]){0,4}$'),
  updated_by_nome text,
  updated_at      timestamptz not null default now()
);
alter table public.tasks add column if not exists municipio_id bigint references public.municipios(id) on delete cascade;
update public.tasks t set municipio_id = c.municipio_id from public.criteria c where c.id = t.criterio_id and t.municipio_id is null;
alter table public.tasks alter column municipio_id set not null;
create index if not exists tasks_municipio_idx on public.tasks (municipio_id);

-- ---------- Histórico de alterações ----------
create table if not exists public.history (
  id          bigint generated always as identity primary key,
  criterio_id bigint not null references public.criteria(id) on delete cascade,
  user_id     uuid,
  user_nome   text not null,
  at          timestamptz not null default now(),
  changes     text not null
);
alter table public.history add column if not exists municipio_id bigint references public.municipios(id) on delete cascade;
update public.history h set municipio_id = c.municipio_id from public.criteria c where c.id = h.criterio_id and h.municipio_id is null;
alter table public.history alter column municipio_id set not null;
create index if not exists history_criterio_idx on public.history (criterio_id, id desc);

-- o município de tasks/history é SEMPRE o do critério (o cliente não consegue forjar outro)
create or replace function public.herda_municipio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select c.municipio_id into new.municipio_id from public.criteria c where c.id = new.criterio_id;
  if new.municipio_id is null then raise exception 'critério inexistente'; end if;
  return new;
end $$;
drop trigger if exists tasks_herda_municipio on public.tasks;
create trigger tasks_herda_municipio before insert on public.tasks for each row execute function public.herda_municipio();
drop trigger if exists history_herda_municipio on public.history;
create trigger history_herda_municipio before insert on public.history for each row execute function public.herda_municipio();

-- ---------- Segurança (RLS) ----------
alter table public.municipios enable row level security;
alter table public.profiles   enable row level security;
alter table public.criteria   enable row level security;
alter table public.tasks      enable row level security;
alter table public.history    enable row level security;

revoke all on public.municipios, public.profiles, public.criteria, public.tasks, public.history from anon;
grant select, insert, update, delete on public.municipios to authenticated;
grant select, update                 on public.profiles   to authenticated;
grant select, insert, update, delete on public.criteria   to authenticated;
grant select, insert, update, delete on public.tasks      to authenticated;
grant select, insert                 on public.history    to authenticated;
grant usage on schema public to authenticated;
grant execute on function public.my_role(), public.my_municipio(), public.is_master() to authenticated;

-- remove políticas antigas (versão anterior, de equipe única) e as atuais, para recriar
drop policy if exists profiles_select      on public.profiles;
drop policy if exists profiles_admin_upd   on public.profiles;
drop policy if exists profiles_self_upd    on public.profiles;
drop policy if exists profiles_master_upd  on public.profiles;
drop policy if exists criteria_select      on public.criteria;
drop policy if exists criteria_admin       on public.criteria;
drop policy if exists criteria_acesso      on public.criteria;
drop policy if exists tasks_select         on public.tasks;
drop policy if exists tasks_insert         on public.tasks;
drop policy if exists tasks_update         on public.tasks;
drop policy if exists tasks_delete         on public.tasks;
drop policy if exists tasks_acesso         on public.tasks;
drop policy if exists history_select       on public.history;
drop policy if exists history_insert       on public.history;
drop policy if exists municipios_select    on public.municipios;
drop policy if exists municipios_master    on public.municipios;

-- municípios: o master vê todos; o usuário vê só o próprio; só o master cria/edita/exclui
create policy municipios_select on public.municipios for select to authenticated
  using (public.is_master() or id = public.my_municipio());
create policy municipios_master on public.municipios for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- perfis: o master vê/edita todos; o usuário vê a si e os colegas do mesmo município
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_master() or id = auth.uid() or municipio_id = public.my_municipio());
create policy profiles_master_upd on public.profiles for update to authenticated
  using (public.is_master()) with check (public.is_master());
-- cada um edita o próprio nome, mas NÃO consegue mudar o próprio papel nem o próprio município
create policy profiles_self_upd on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role() and municipio_id is not distinct from public.my_municipio());

-- critérios, andamento e histórico: master em tudo; usuário somente no próprio município
create policy criteria_acesso on public.criteria for all to authenticated
  using (public.is_master() or municipio_id = public.my_municipio())
  with check (public.is_master() or municipio_id = public.my_municipio());
create policy tasks_acesso on public.tasks for all to authenticated
  using (public.is_master() or municipio_id = public.my_municipio())
  with check (public.is_master() or municipio_id = public.my_municipio());
create policy history_select on public.history for select to authenticated
  using (public.is_master() or municipio_id = public.my_municipio());
create policy history_insert on public.history for insert to authenticated
  with check ((public.is_master() or municipio_id = public.my_municipio()) and user_id = auth.uid());

-- ---------- Resumo por município (painel do master) ----------
create or replace function public.resumo_municipios()
returns table (municipio_id bigint, criterios bigint, concluidos bigint, andamento bigint, pendentes bigint, na bigint, usuarios bigint)
language sql stable security definer set search_path = public as $$
  select m.id,
    (select count(*) from public.criteria c where c.municipio_id = m.id),
    (select count(*) from public.tasks t where t.municipio_id = m.id and t.status = 'concluido'),
    (select count(*) from public.tasks t where t.municipio_id = m.id and t.status = 'andamento'),
    (select count(*) from public.tasks t where t.municipio_id = m.id and t.status = 'pendente'),
    (select count(*) from public.tasks t where t.municipio_id = m.id and t.status = 'na'),
    (select count(*) from public.profiles p where p.municipio_id = m.id)
  from public.municipios m
  where public.is_master()          -- quem não é master recebe lista vazia
  order by m.nome
$$;
revoke all on function public.resumo_municipios() from public, anon;
grant execute on function public.resumo_municipios() to authenticated;

-- ---------- Tempo real ----------
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;      -- já estava na publicação
  when undefined_object then null;      -- publicação inexistente (fora do Supabase)
end $$;

-- ---------- Permissões do papel de serviço ----------
-- projetos novos do Supabase não dão permissão automática em tabelas novas: concede explicitamente ao papel de serviço
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on public.municipios, public.profiles, public.criteria, public.tasks, public.history to service_role;
    grant execute on function public.my_role(), public.my_municipio(), public.is_master(), public.resumo_municipios() to service_role;
  end if;
end $$;
