-- Bogati HORECA. Run once in the SQL Editor of the Bogati Brain Supabase project.
-- Only the server service_role may read/write this module. No browser credentials.
begin;

create table if not exists public.horeca_config (
 id smallint primary key default 1 check (id = 1),
 configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
 revision bigint not null default 0 check (revision >= 0),
 updated_at timestamptz not null default now()
);

create table if not exists public.horeca_quotes (
 id uuid primary key,
 number text not null unique,
 document jsonb not null check (jsonb_typeof(document) = 'object'),
 created_at timestamptz not null default now(),
 customer_id uuid,
 seller_id uuid
);
comment on column public.horeca_quotes.customer_id is 'Reserved for a future Brain customer record; no assumed external table.';
comment on column public.horeca_quotes.seller_id is 'Reserved for future individual seller identity in Brain.';
create index if not exists horeca_quotes_created_at_idx on public.horeca_quotes (created_at desc);
alter table public.horeca_config enable row level security;
alter table public.horeca_quotes enable row level security;
revoke all on table public.horeca_config, public.horeca_quotes from public, anon, authenticated;
grant select, insert, update on public.horeca_config to service_role;
grant select, insert on public.horeca_quotes to service_role;
grant usage on schema public to service_role;

create or replace function public.horeca_read_state(p_initial_config jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
 insert into public.horeca_config (id,configuration) values (1,p_initial_config)
 on conflict (id) do nothing;
 select jsonb_build_object(
  'config', c.configuration,
  'revision', c.revision,
  'quotes', coalesce((select jsonb_agg(q.document order by q.created_at desc, q.id) from public.horeca_quotes q),'[]'::jsonb)
 ) into result from public.horeca_config c where c.id=1;
 return result;
end;
$$;

create or replace function public.horeca_commit_state(
 p_expected_revision bigint, p_config jsonb, p_new_quotes jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint; quote jsonb;
begin
 select revision into current_revision from public.horeca_config where id=1 for update;
 if current_revision is null or current_revision <> p_expected_revision then return false; end if;
 if jsonb_typeof(p_new_quotes) <> 'array' or jsonb_typeof(p_config) <> 'object' then
  raise exception 'Invalid module payload';
 end if;
 update public.horeca_config set configuration=p_config, revision=revision+1, updated_at=now() where id=1;
 for quote in select value from jsonb_array_elements(p_new_quotes) loop
  insert into public.horeca_quotes (id,number,document,created_at)
  values ((quote->>'id')::uuid,quote->>'number',quote,(quote->>'createdAt')::timestamptz);
 end loop;
 return true;
end;
$$;

revoke all on function public.horeca_read_state(jsonb) from public, anon, authenticated;
revoke all on function public.horeca_commit_state(bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.horeca_read_state(jsonb) to service_role;
grant execute on function public.horeca_commit_state(bigint,jsonb,jsonb) to service_role;
commit;
