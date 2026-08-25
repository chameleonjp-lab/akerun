-- Serialize preparation per normalized player name and refuse to resume an
-- expired active run. This closes the concurrent-request loophole around the
-- three-open-run guard and avoids presenting an already unusable run as live.

create or replace function public.akerun_prepare_run_internal(
  p_display_name text,
  p_client_version text,
  p_problem_id text default null,
  p_replay_run_token uuid default null
)
returns table(
  accepted boolean,
  run_token uuid,
  problem_id text,
  problem_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.akerun_competition_config%rowtype;
  v_problem private.akerun_problem_catalog_v1%rowtype;
  v_display_name text;
  v_normalized_name text;
  v_now timestamptz := clock_timestamp();
  v_open_count integer;
  v_run_token uuid;
begin
  v_display_name := btrim(coalesce(p_display_name, ''));
  v_normalized_name := public.normalize_player_name(p_display_name);

  if p_client_version is distinct from 'akerun-web-verified-v1'
     or p_display_name is null
     or p_display_name is distinct from v_normalized_name
     or char_length(v_normalized_name) < 1
     or char_length(v_normalized_name) > 20
     or (p_problem_id is not null and p_problem_id !~ '^AKERUN-[0-9]{2}-V[0-9]+$')
     or (p_problem_id is null and p_replay_run_token is not null)
     or (p_problem_id is not null and p_replay_run_token is null)
  then
    raise exception 'akerun ranking preparation is invalid';
  end if;

  select * into v_config
  from private.akerun_competition_config c
  where c.singleton = true
  for share;
  if not found or v_config.accepting_runs is not true then
    raise sqlstate 'PT503' using message = 'akerun ranking is not accepting runs';
  end if;
  if not exists (
    select 1 from public.games g
    where g.game_slug = 'akerun'
      and g.is_active = true
      and g.submission_mode = 'verified'
  ) then
    raise sqlstate 'PT503' using message = 'akerun game is not active';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('akerun-prepare:' || v_normalized_name, 0)
  );

  select count(*)::integer into v_open_count
  from private.akerun_runs_v1 r
  where r.normalized_name = v_normalized_name
    and r.status in ('prepared', 'active')
    and r.expires_at > v_now;
  if v_open_count >= 3 then
    raise sqlstate '42901' using message = 'too many unconsumed akerun runs';
  end if;

  if p_problem_id is null then
    select * into v_problem
    from private.akerun_problem_catalog_v1
    order by random()
    limit 1;
  else
    if not exists (
      select 1
      from private.akerun_runs_v1 r
      where r.run_token = p_replay_run_token
        and r.normalized_name = v_normalized_name
        and r.status = 'completed'
        and r.problem_id = p_problem_id
    ) then
      raise exception 'akerun replay token does not authorize this problem';
    end if;
    select * into v_problem
    from private.akerun_problem_catalog_v1 p
    where p.problem_id = p_problem_id;
  end if;
  if not found then
    raise exception 'akerun problem is unavailable';
  end if;

  v_run_token := gen_random_uuid();
  insert into private.akerun_runs_v1 (
    run_token, generation, client_version, contract_version,
    display_name, normalized_name, problem_id, problem_version,
    status, prepared_at, expires_at
  ) values (
    v_run_token, v_config.generation, v_config.client_version, v_config.contract_version,
    v_display_name, v_normalized_name, v_problem.problem_id, v_problem.problem_version,
    'prepared', v_now, v_now + interval '24 hours'
  );

  return query select true, v_run_token, v_problem.problem_id, v_problem.problem_version;
end;
$$;

create or replace function public.akerun_begin_run_internal(
  p_run_token uuid,
  p_client_version text
)
returns table(
  accepted boolean,
  problem_id text,
  problem_version text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.akerun_competition_config%rowtype;
  v_run private.akerun_runs_v1%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_config
  from private.akerun_competition_config c
  where c.singleton = true
  for share;
  if not found or v_config.accepting_runs is not true then
    raise sqlstate 'PT503' using message = 'akerun ranking is not accepting runs';
  end if;
  if not exists (
    select 1 from public.games g
    where g.game_slug = 'akerun'
      and g.is_active = true
      and g.submission_mode = 'verified'
  ) then
    raise sqlstate 'PT503' using message = 'akerun game is not active';
  end if;
  if p_client_version is distinct from v_config.client_version then
    raise exception 'akerun client version is invalid';
  end if;

  select * into v_run
  from private.akerun_runs_v1 r
  where r.run_token = p_run_token
  for update;
  if not found or v_run.client_version is distinct from v_config.client_version
     or v_run.contract_version is distinct from v_config.contract_version
  then
    raise exception 'akerun run is unavailable';
  end if;
  if v_run.status = 'active' and v_run.expires_at > v_now then
    return query select true, v_run.problem_id, v_run.problem_version;
    return;
  end if;
  if v_run.status is distinct from 'prepared' or v_run.expires_at <= v_now then
    raise exception 'akerun run cannot begin';
  end if;

  update private.akerun_runs_v1
  set status = 'active', started_at = v_now, expires_at = v_now + interval '24 hours'
  where run_token = p_run_token;

  return query select true, v_run.problem_id, v_run.problem_version;
end;
$$;

revoke all on function public.akerun_prepare_run_internal(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.akerun_begin_run_internal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.akerun_prepare_run_internal(text, text, text, uuid)
  to service_role;
grant execute on function public.akerun_begin_run_internal(uuid, text)
  to service_role;
