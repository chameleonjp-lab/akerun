-- Akerun play contract v2.
--
-- The client now reports false-gate contacts above each problem's unavoidable
-- baseline. Keep old completed rows readable, but only the v2 config/client
-- may prepare new runs. Reception remains disabled until the release is
-- deployed and verified in production.

alter table private.akerun_competition_config
  drop constraint if exists akerun_competition_config_client_version_check,
  drop constraint if exists akerun_competition_config_contract_version_check;

alter table private.akerun_runs_v1
  drop constraint if exists akerun_runs_v1_client_version_check,
  drop constraint if exists akerun_runs_v1_contract_version_check;

update private.akerun_competition_config
set client_version = 'akerun-web-verified-v2',
    contract_version = 'akerun-play-v2',
    accepting_runs = false,
    updated_at = clock_timestamp()
where singleton = true;

alter table private.akerun_competition_config
  add constraint akerun_competition_config_client_version_check
    check (client_version = 'akerun-web-verified-v2'),
  add constraint akerun_competition_config_contract_version_check
    check (contract_version = 'akerun-play-v2');

alter table private.akerun_runs_v1
  add constraint akerun_runs_v1_client_version_check
    check (client_version in ('akerun-web-verified-v1', 'akerun-web-verified-v2')),
  add constraint akerun_runs_v1_contract_version_check
    check (contract_version in ('akerun-play-v1', 'akerun-play-v2'));

comment on column private.akerun_runs_v1.false_gate_contacts is
  'Akerun v2: false-gate contacts above the problem-specific unavoidable baseline.';

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

  if p_client_version is distinct from 'akerun-web-verified-v2'
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

revoke all on function public.akerun_prepare_run_internal(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.akerun_prepare_run_internal(text, text, text, uuid)
  to service_role;

comment on function public.akerun_prepare_run_internal(text, text, text, uuid) is
  'Internal service-role RPC for the Akerun v2 play contract; explicit problem selection requires a completed same-problem replay token.';
