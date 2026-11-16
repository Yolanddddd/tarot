-- Run after spread_sessions.sql and anonymous_interpretations.sql.
-- Only the Vercel server's service role may access private questions, BG and results.
-- Never copy these columns into the publicly readable spread_sessions.payload.

create table if not exists public.private_reading_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_success_at timestamptz,
  used_count integer not null default 0 check (used_count between 0 and 3),
  reservation_token uuid,
  reservation_until timestamptz
);

create index if not exists private_reading_entitlements_first_success_idx
  on public.private_reading_entitlements(first_success_at)
  where first_success_at is not null;

create table if not exists public.private_interpretations (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.spread_sessions(id) on delete cascade,
  question text not null check (char_length(question) between 8 and 300),
  background jsonb not null default '{}'::jsonb,
  model text not null,
  status text not null check (status in ('processing', 'complete')),
  lease_token uuid,
  lease_until timestamptz,
  interpretation jsonb,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, session_id),
  check (status <> 'complete' or interpretation is not null)
);

create index if not exists private_interpretations_owner_completed_idx
  on public.private_interpretations(user_id, completed_at desc);

alter table public.private_reading_entitlements enable row level security;
alter table public.private_interpretations enable row level security;
revoke all on public.private_reading_entitlements from anon, authenticated;
revoke all on public.private_interpretations from anon, authenticated;
grant all on public.private_reading_entitlements to service_role;
grant all on public.private_interpretations to service_role;

-- Serialises the first-200 seat allocation and each user's three-use cap.
-- A short reservation is not a seat: first_success_at is set only on success.
create or replace function public.claim_private_interpretation(
  p_user_id uuid, p_session_id uuid, p_question text, p_background jsonb,
  p_model text, p_lease_token uuid
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  existing public.private_interpretations%rowtype;
  entitlement public.private_reading_entitlements%rowtype;
  active_users integer;
  active_readings integer;
begin
  if p_user_id is null or p_session_id is null or p_lease_token is null or
     p_question is null or char_length(p_question) not between 8 and 300 or
     p_background is null or jsonb_typeof(p_background) <> 'object' or
     p_model is null or char_length(p_model) > 80 then
    raise exception 'Invalid private interpretation claim';
  end if;

  perform pg_advisory_xact_lock(71642683);
  select * into existing from public.private_interpretations
    where user_id = p_user_id and session_id = p_session_id for update;
  if found then
    if existing.status = 'complete' then return 'complete'; end if;
    if existing.lease_until > now() then return 'pending'; end if;
  end if;

  select * into entitlement from public.private_reading_entitlements
    where user_id = p_user_id for update;
  if entitlement.first_success_at is not null then
    select count(*) into active_readings from public.private_interpretations
      where user_id = p_user_id and status = 'processing' and lease_until > now();
    if entitlement.used_count + active_readings >= 3 then return 'quota_exhausted'; end if;
  else
    if entitlement.reservation_until > now() then return 'pending'; end if;
    select count(*) into active_users from public.private_reading_entitlements
      where first_success_at is not null or reservation_until > now();
    if active_users >= 200 then return 'promo_full'; end if;
    insert into public.private_reading_entitlements
      (user_id, reservation_token, reservation_until)
      values (p_user_id, p_lease_token, now() + interval '90 seconds')
      on conflict (user_id) do update set
        reservation_token = excluded.reservation_token,
        reservation_until = excluded.reservation_until;
  end if;

  insert into public.private_interpretations
    (user_id, session_id, question, background, model, status, lease_token, lease_until)
    values (p_user_id, p_session_id, p_question, p_background, p_model,
      'processing', p_lease_token, now() + interval '90 seconds')
    on conflict (user_id, session_id) do update set
      question = excluded.question, background = excluded.background,
      model = excluded.model, status = 'processing',
      lease_token = excluded.lease_token, lease_until = excluded.lease_until,
      interpretation = null, input_tokens = null, output_tokens = null,
      completed_at = null;
  return 'claimed';
end;
$$;

create or replace function public.complete_private_interpretation(
  p_user_id uuid, p_session_id uuid, p_lease_token uuid,
  p_interpretation jsonb, p_input_tokens integer, p_output_tokens integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  completed_time timestamptz;
begin
  if p_interpretation is null or jsonb_typeof(p_interpretation) <> 'object' then
    raise exception 'Invalid interpretation';
  end if;
  perform pg_advisory_xact_lock(71642683);
  update public.private_interpretations set
    status = 'complete', interpretation = p_interpretation,
    input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    completed_at = clock_timestamp(), lease_token = null, lease_until = null
    where user_id = p_user_id and session_id = p_session_id and
      status = 'processing' and lease_token = p_lease_token and lease_until > now()
    returning completed_at into completed_time;
  if not found then return false; end if;

  update public.private_reading_entitlements set
    first_success_at = coalesce(first_success_at, completed_time),
    used_count = used_count + 1,
    reservation_token = null, reservation_until = null
    where user_id = p_user_id;
  if not found then raise exception 'Missing private reading entitlement'; end if;
  return true;
end;
$$;

create or replace function public.release_private_interpretation(
  p_user_id uuid, p_session_id uuid, p_lease_token uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(71642683);
  delete from public.private_interpretations
    where user_id = p_user_id and session_id = p_session_id and
      status = 'processing' and lease_token = p_lease_token;
  update public.private_reading_entitlements set
    reservation_token = null, reservation_until = null
    where user_id = p_user_id and first_success_at is null and
      reservation_token = p_lease_token;
  delete from public.private_reading_entitlements
    where user_id = p_user_id and first_success_at is null and reservation_token is null;
end;
$$;

revoke all on function public.claim_private_interpretation(uuid, uuid, text, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_private_interpretation(uuid, uuid, uuid, jsonb, integer, integer)
  from public, anon, authenticated;
revoke all on function public.release_private_interpretation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_private_interpretation(uuid, uuid, text, jsonb, text, uuid)
  to service_role;
grant execute on function public.complete_private_interpretation(uuid, uuid, uuid, jsonb, integer, integer)
  to service_role;
grant execute on function public.release_private_interpretation(uuid, uuid, uuid)
  to service_role;
