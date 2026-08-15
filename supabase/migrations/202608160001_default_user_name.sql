create or replace function public.set_default_todo_user_name()
returns trigger language plpgsql as $$
begin
  if coalesce(btrim(new.name), '') = '' then new.name := 'USER';
  else new.name := btrim(new.name); end if;
  new.updated_at := now();
  return new;
end;
$$;
