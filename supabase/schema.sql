create table if not exists public.todo_lists (
  id text primary key,
  name text not null default 'To do',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.todo_items (
  id text primary key,
  list_id text not null references public.todo_lists(id) on delete cascade,
  title text not null default '',
  status text not null default 'action' check (status in ('action', 'awaiting', 'done')),
  priority text not null default 'none' check (priority in ('none', 'important', 'urgent', 'urgent_important')),
  created bigint not null,
  updated bigint not null
);

alter table public.todo_lists enable row level security;
alter table public.todo_items enable row level security;

drop policy if exists "Public todo list access" on public.todo_lists;
create policy "Public todo list access"
on public.todo_lists
for all
to anon
using (true)
with check (true);

drop policy if exists "Public todo item access" on public.todo_items;
create policy "Public todo item access"
on public.todo_items
for all
to anon
using (true)
with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_lists'
  ) then
    alter publication supabase_realtime add table public.todo_lists;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'todo_items'
  ) then
    alter publication supabase_realtime add table public.todo_items;
  end if;
end $$;
