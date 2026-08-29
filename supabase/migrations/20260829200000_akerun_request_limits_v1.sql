-- Akerun request limits and bounded cleanup for the private run ledger.
-- The keys are generated and hashed by the Edge Function; raw source/device/name values
-- are never stored in this table.

create table if not exists private.akerun_request_buckets_v1 (
  bucket_key text not null,
  action text not null
    check (action in ('prepare', 'begin', 'abandon', 'finish')),
  primary key (action, bucket_key),
  request_count integer not null
    check (request_count between 0 and 1000),
  window_started_at timestamptz not null,
  last_request_at timestamptz not null,
  expires_at timestamptz not null,
  constraint akerun_request_bucket_key_ck
    check (char_length(bucket_key) between 16 and 128)
);

alter table private.akerun_request_buckets_v1 enable row level security;

create index if not exists akerun_request_buckets_expires_idx
  on private.akerun_request_buckets_v1 (expires_at);

comment on table private.akerun_request_buckets_v1 is
  'Private hashed request buckets used to limit repeated Akerun competition requests.';

create or replace function public.akerun_request_gate_internal(
  p_action text,
  p_source_key text,
  p_device_key text,
  p_name_key text
)
returns table(
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $akerun_request_gate$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer;
  v_window_seconds integer;
  v_keys text[] := array[p_source_key, p_device_key, p_name_key];
  v_retry_after integer;
  v_key text;
begin
  if p_action is null
     or p_action not in ('prepare', 'begin', 'abandon', 'finish')
     or p_source_key is null
     or char_length(p_source_key) not between 16 and 128
     or p_device_key is null
     or char_length(p_device_key) not between 16 and 128
     or p_name_key is null
     or char_length(p_name_key) not between 16 and 128
  then
    raise exception 'akerun request gate input is invalid';
  end if;

  if p_action = 'prepare' then
    v_limit := 20;
    v_window_seconds := 600;
  elsif p_action = 'begin' then
    v_limit := 60;
    v_window_seconds := 300;
  elsif p_action = 'abandon' then
    v_limit := 30;
    v_window_seconds := 300;
  else
    v_limit := 15;
    v_window_seconds := 300;
  end if;

  -- Keep abandoned, prepared, and stale active runs for 24 hours so retries
  -- remain diagnosable, then remove them in a small batch on the next request.
  delete from private.akerun_runs_v1 r
  where r.run_token in (
    select stale.run_token
    from private.akerun_runs_v1 stale
    where stale.status in ('prepared', 'active', 'rejected')
      and stale.expires_at < v_now - interval '24 hours'
    order by stale.expires_at
    for update skip locked
    limit 100
  );

  -- Request buckets expire at the end of their window. Bound cleanup so one
  -- request cannot spend unbounded time deleting old buckets.
  delete from private.akerun_request_buckets_v1 stale
  where stale.ctid in (
    select candidate.ctid
    from private.akerun_request_buckets_v1 candidate
    where candidate.expires_at < v_now
    order by candidate.expires_at
    limit 200
  );

  -- Create the three buckets after the advisory locks are held.
  insert into private.akerun_request_buckets_v1 (
    bucket_key,
    action,
    request_count,
    window_started_at,
    last_request_at,
    expires_at
  )
  select key,
         p_action,
         0,
         v_now,
         v_now,
         v_now + pg_catalog.make_interval(secs => v_window_seconds)
  from unnest(v_keys) as keys(key)
  on conflict (action, bucket_key) do nothing;

  -- Serialize callers by the three keys in stable order. Advisory locks avoid
  -- row-lock ordering issues before the bucket rows are created.
  for v_key in
    select distinct key
    from unnest(v_keys) as keys(key)
    order by key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_key, 0)
    );
  end loop;

  if exists (
    select 1
    from private.akerun_request_buckets_v1 bucket
    where bucket.bucket_key = any(v_keys)
      and bucket.action = p_action
      and v_now < bucket.window_started_at
        + pg_catalog.make_interval(secs => v_window_seconds)
      and bucket.request_count >= v_limit
  ) then
    select ceil(extract(epoch from (
      min(
        bucket.window_started_at
        + pg_catalog.make_interval(secs => v_window_seconds)
        - v_now
      )
    )))::integer
    into v_retry_after
    from private.akerun_request_buckets_v1 bucket
    where bucket.bucket_key = any(v_keys)
      and bucket.action = p_action
      and v_now < bucket.window_started_at
        + pg_catalog.make_interval(secs => v_window_seconds)
      and bucket.request_count >= v_limit;

    return query select false, greatest(1, coalesce(v_retry_after, 1));
    return;
  end if;

  update private.akerun_request_buckets_v1 bucket
  set request_count = case
        when v_now >= bucket.window_started_at
          + pg_catalog.make_interval(secs => v_window_seconds)
          then 1
        else bucket.request_count + 1
      end,
      window_started_at = case
        when v_now >= bucket.window_started_at
          + pg_catalog.make_interval(secs => v_window_seconds)
          then v_now
        else bucket.window_started_at
      end,
      last_request_at = v_now,
      expires_at = case
        when v_now >= bucket.window_started_at
          + pg_catalog.make_interval(secs => v_window_seconds)
          then v_now + pg_catalog.make_interval(secs => v_window_seconds)
        else bucket.expires_at
      end
  where bucket.bucket_key = any(v_keys)
    and bucket.action = p_action;

  return query select true, 0;
end;
$akerun_request_gate$;

revoke all on table private.akerun_request_buckets_v1 from public, anon, authenticated;

revoke all on function public.akerun_request_gate_internal(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.akerun_request_gate_internal(text, text, text, text)
  to service_role;

comment on function public.akerun_request_gate_internal(text, text, text, text) is
  'Service-role request gate for Akerun source, device, and name buckets with bounded stale-run cleanup.';
