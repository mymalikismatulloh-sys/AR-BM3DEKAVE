create extension if not exists pgcrypto;

create table if not exists public.studio_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_targets (
  id uuid primary key default gen_random_uuid(),
  target_index integer not null unique check (target_index >= 0),
  title text not null,
  marker_url text not null,
  content_url text not null,
  content_type text not null check (content_type in ('image', 'video')),
  width numeric not null default 1 check (width > 0),
  height numeric not null default 1 check (height > 0),
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  position_z numeric not null default 0.65,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_settings (
  id integer primary key check (id = 1),
  target_file_url text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_studio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.studio_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_studio_admin() from public;
grant execute on function public.is_studio_admin() to authenticated;

alter table public.studio_admins enable row level security;
alter table public.studio_targets enable row level security;
alter table public.studio_settings enable row level security;

grant select on public.studio_admins to authenticated;
grant select on public.studio_targets to anon, authenticated;
grant insert, update, delete on public.studio_targets to authenticated;
grant select on public.studio_settings to anon, authenticated;
grant insert, update, delete on public.studio_settings to authenticated;

create policy "Admins can read their own admin record"
  on public.studio_admins for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Anyone can read enabled studio targets"
  on public.studio_targets for select
  to anon, authenticated
  using (enabled or (select public.is_studio_admin()));

create policy "Admins can insert studio targets"
  on public.studio_targets for insert
  to authenticated
  with check ((select public.is_studio_admin()));

create policy "Admins can update studio targets"
  on public.studio_targets for update
  to authenticated
  using ((select public.is_studio_admin()))
  with check ((select public.is_studio_admin()));

create policy "Admins can delete studio targets"
  on public.studio_targets for delete
  to authenticated
  using ((select public.is_studio_admin()));

create policy "Anyone can read studio settings"
  on public.studio_settings for select
  to anon, authenticated
  using (true);

create policy "Admins can write studio settings"
  on public.studio_settings for all
  to authenticated
  using ((select public.is_studio_admin()))
  with check ((select public.is_studio_admin()));

insert into storage.buckets (id, name, public)
values ('studio-assets', 'studio-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "Anyone can read studio assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'studio-assets');

create policy "Admins can upload studio assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'studio-assets'
    and (select public.is_studio_admin())
  );

create policy "Admins can update studio assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'studio-assets'
    and (select public.is_studio_admin())
  )
  with check (
    bucket_id = 'studio-assets'
    and (select public.is_studio_admin())
  );

create policy "Admins can delete studio assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'studio-assets'
    and (select public.is_studio_admin())
  );
