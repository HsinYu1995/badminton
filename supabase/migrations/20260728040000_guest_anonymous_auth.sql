alter table public.profiles add column is_anonymous boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, photo_url, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      case when new.email is not null then split_part(new.email, '@', 1) end,
      'Guest ' || substr(new.id::text, 1, 4)
    ),
    new.raw_user_meta_data->>'avatar_url',
    new.is_anonymous
  );
  return new;
end;
$$;
