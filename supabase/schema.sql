-- =====================================================================
--  Checklist Transparência Municipal — esquema do banco (Supabase/Postgres)
--  Cole este arquivo inteiro no SQL Editor do Supabase e clique em RUN.
--  É idempotente: pode ser executado de novo sem perder dados.
-- =====================================================================

-- ---------- Perfis (1 por usuário do Supabase Auth) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  email      text,
  role       text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);

-- papel do usuário logado (SECURITY DEFINER evita recursão nas políticas de RLS)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ao criar um usuário: cria o perfil. O PRIMEIRO usuário vira admin; os demais entram como "viewer"
-- (somente leitura) até um admin promovê-los a "editor" na tela Usuários.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'viewer' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- perfis de usuários que já existiam antes deste script (o 1º vira admin)
insert into public.profiles (id, nome, email, role)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)), u.email,
       case when row_number() over (order by u.created_at) = 1
                 and not exists (select 1 from public.profiles) then 'admin' else 'viewer' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------- Critérios (a ficha do Radar da Transparência) ----------
create table if not exists public.criteria (
  id            bigint generated always as identity primary key,
  ciclo         int  not null,
  ordem         int  not null,
  dimensao      text not null,
  num           text not null,                 -- ex.: '6.7'
  criterio      text not null,
  exigibilidade text not null,                 -- Essencial | Obrigatória | Recomendada
  disp          text, atual text, serie text, grav text, filtros text,   -- atende | não atende | não se aplica
  evidencias    text[] not null default '{}',
  unique (ciclo, num)
);

-- ---------- Andamento de cada critério (compartilhado por toda a equipe) ----------
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

-- ---------- Histórico de alterações ----------
create table if not exists public.history (
  id          bigint generated always as identity primary key,
  criterio_id bigint not null references public.criteria(id) on delete cascade,
  user_id     uuid,
  user_nome   text not null,
  at          timestamptz not null default now(),
  changes     text not null
);
create index if not exists history_criterio_idx on public.history (criterio_id, id desc);

-- ---------- Segurança (RLS): só quem está logado enxerga; papéis controlam a escrita ----------
alter table public.profiles enable row level security;
alter table public.criteria enable row level security;
alter table public.tasks    enable row level security;
alter table public.history  enable row level security;

revoke all on public.profiles, public.criteria, public.tasks, public.history from anon;
grant select, update                 on public.profiles to authenticated;
grant select, insert, update, delete on public.criteria to authenticated;
grant select, insert, update, delete on public.tasks    to authenticated;
grant select, insert                 on public.history  to authenticated;

drop policy if exists profiles_select      on public.profiles;
drop policy if exists profiles_admin_upd   on public.profiles;
drop policy if exists profiles_self_upd    on public.profiles;
create policy profiles_select    on public.profiles for select to authenticated using (true);
create policy profiles_admin_upd on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
-- cada um edita o próprio nome, mas NÃO consegue mudar o próprio papel
create policy profiles_self_upd  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

drop policy if exists criteria_select on public.criteria;
drop policy if exists criteria_admin  on public.criteria;
create policy criteria_select on public.criteria for select to authenticated using (true);
create policy criteria_admin  on public.criteria for all    to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (true);
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.my_role() in ('admin','editor'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.my_role() in ('admin','editor')) with check (public.my_role() in ('admin','editor'));
create policy tasks_delete on public.tasks for delete to authenticated using (public.my_role() = 'admin');

drop policy if exists history_select on public.history;
drop policy if exists history_insert on public.history;
create policy history_select on public.history for select to authenticated using (true);
create policy history_insert on public.history for insert to authenticated
  with check (public.my_role() in ('admin','editor') and user_id = auth.uid());

-- ---------- Tempo real: a equipe vê as mudanças dos outros sem recarregar ----------
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;      -- já estava na publicação
  when undefined_object then null;      -- publicação inexistente (fora do Supabase)
end $$;
