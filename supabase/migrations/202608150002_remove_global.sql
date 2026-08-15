drop index if exists public.todo_lists_global_idx;
drop index if exists public.todo_items_user_global_idx;

alter table public.todo_items drop column if exists global;
alter table public.todo_lists drop column if exists global;

drop function if exists public.create_todo_user(text);
