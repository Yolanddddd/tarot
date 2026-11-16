-- Run after spread_sessions.sql. Only the server's Supabase secret key may
-- read/write these tables or execute the claim and quota functions.
create table if not exists public.anonymous_interpretation_cache (
  cache_key text primary key,
  model text not null,
  status text not null check (status in ('processing', 'complete')),
  owner_token uuid,
  lease_until timestamptz,
  overall text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status <> 'complete' or overall is not null)
);

create table if not exists public.anonymous_interpretation_sessions (
  session_id uuid primary key references public.spread_sessions(id) on delete cascade,
  cache_key text not null references public.anonymous_interpretation_cache(cache_key),
  created_at timestamptz not null default now()
);

create table if not exists public.anonymous_interpretation_daily_usage (
  usage_day date primary key,
  generation_count integer not null default 0 check (generation_count >= 0)
);

alter table public.anonymous_interpretation_cache enable row level security;
alter table public.anonymous_interpretation_sessions enable row level security;
alter table public.anonymous_interpretation_daily_usage enable row level security;

revoke all on public.anonymous_interpretation_cache from anon, authenticated;
revoke all on public.anonymous_interpretation_sessions from anon, authenticated;
revoke all on public.anonymous_interpretation_daily_usage from anon, authenticated;
grant all on public.anonymous_interpretation_cache to service_role;
grant all on public.anonymous_interpretation_sessions to service_role;
grant all on public.anonymous_interpretation_daily_usage to service_role;

create or replace function public.claim_anonymous_interpretation(
  p_cache_key text, p_model text, p_owner_token uuid
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  existing public.anonymous_interpretation_cache%rowtype;
begin
  if length(p_cache_key) <> 64 or p_owner_token is null then
    raise exception 'Invalid cache claim';
  end if;

  insert into public.anonymous_interpretation_cache
    (cache_key, model, status, owner_token, lease_until)
  values (p_cache_key, p_model, 'processing', p_owner_token, now() + interval '90 seconds')
  on conflict do nothing;
  if found then return 'claimed'; end if;

  select * into existing from public.anonymous_interpretation_cache
  where cache_key = p_cache_key for update;
  if existing.status = 'complete' then return 'cached'; end if;
  if existing.lease_until > now() then return 'pending'; end if;

  update public.anonymous_interpretation_cache
  set model = p_model, owner_token = p_owner_token,
      lease_until = now() + interval '90 seconds'
  where cache_key = p_cache_key;
  return 'claimed';
end;
$$;

create or replace function public.reserve_anonymous_interpretation(
  p_limit integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid daily limit';
  end if;
  insert into public.anonymous_interpretation_daily_usage
    (usage_day, generation_count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (usage_day) do update
    set generation_count = public.anonymous_interpretation_daily_usage.generation_count + 1
    where public.anonymous_interpretation_daily_usage.generation_count < p_limit;
  return found;
end;
$$;

revoke all on function public.claim_anonymous_interpretation(text, text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_anonymous_interpretation(integer) from public, anon, authenticated;
grant execute on function public.claim_anonymous_interpretation(text, text, uuid) to service_role;
grant execute on function public.reserve_anonymous_interpretation(integer) to service_role;
