create or replace function public.delete_todo_user(target_user_id bigint)
returns table (deleted_now boolean, deletion_at timestamptz)
language plpgsql
as $$
declare
  has_items boolean;
begin
  select exists (
    select 1 from public.todo_items where user_id = target_user_id
  ) into has_items;

  if has_items then
    return query
    update public.todo_users
    set deletion_at = now() + interval '7 days'
    where todo_users.id = target_user_id and todo_users.deletion_at is null
    returning false, todo_users.deletion_at;
  else
    delete from public.todo_users where id = target_user_id;
    return query select true, null::timestamptz;
  end if;
end;
$$;
