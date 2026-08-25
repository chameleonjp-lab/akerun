-- akerun verified competition contract.
--
-- The public ranking tables remain the Chameleon JP shared source of truth.
-- This migration adds only a private problem/run ledger for server validation.
-- Reception is intentionally disabled until the Edge Function and client are
-- deployed and checked in production.

create schema if not exists private;

insert into public.games (
  game_slug, title, game_url, description, share_text, score_order, score_unit,
  is_active, release_date, score_scale, score_decimals, score_label,
  first_score_label, best_score_label, display_order, top_ranking_type,
  submission_mode
) values (
  'akerun',
  'Vault Tumbler Lab',
  'https://chameleonjp-lab.github.io/akerun/',
  '音・抵抗・内部機構を観察しながら、6輪金庫を開けるゲームです。',
  'Vault Tumbler Labで金庫を開けました',
  'desc', '点', false, current_date, 1, 0, '総合スコア',
  '初回記録', '最高スコア', 35, 'best', 'verified'
)
on conflict (game_slug) do update
set title = excluded.title,
    game_url = excluded.game_url,
    description = excluded.description,
    share_text = excluded.share_text,
    score_order = excluded.score_order,
    score_unit = excluded.score_unit,
    is_active = false,
    release_date = excluded.release_date,
    score_scale = excluded.score_scale,
    score_decimals = excluded.score_decimals,
    score_label = excluded.score_label,
    first_score_label = excluded.first_score_label,
    best_score_label = excluded.best_score_label,
    display_order = excluded.display_order,
    top_ranking_type = excluded.top_ranking_type,
    submission_mode = 'verified';

create table if not exists private.akerun_competition_config (
  singleton boolean primary key default true check (singleton),
  generation text not null check (generation = 'official-problem-v1'),
  client_version text not null check (client_version = 'akerun-web-verified-v1'),
  contract_version text not null check (contract_version = 'akerun-play-v1'),
  accepting_runs boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

insert into private.akerun_competition_config (
  singleton, generation, client_version, contract_version, accepting_runs
) values (
  true, 'official-problem-v1', 'akerun-web-verified-v1', 'akerun-play-v1', false
)
on conflict (singleton) do update
set generation = excluded.generation,
    client_version = excluded.client_version,
    contract_version = excluded.contract_version,
    accepting_runs = false,
    updated_at = clock_timestamp();

create table if not exists private.akerun_problem_catalog_v1 (
  problem_id text primary key check (problem_id ~ '^AKERUN-[0-9]{2}-V[0-9]+$'),
  problem_version text not null check (problem_version ~ '^V[0-9]+$'),
  tier text not null check (tier in ('beginner', 'standard', 'advanced')),
  vault_id text not null,
  wheel_count smallint not null check (wheel_count between 1 and 6),
  par_time integer not null check (par_time between 1 and 3600),
  par_dial_steps integer not null check (par_dial_steps between 1 and 100000),
  par_faults integer not null check (par_faults between 0 and 100),
  difficulty_weight numeric(5,3) not null check (difficulty_weight between 0.500 and 2.000)
);

insert into private.akerun_problem_catalog_v1 (
  problem_id, problem_version, tier, vault_id, wheel_count,
  par_time, par_dial_steps, par_faults, difficulty_weight
) values
  ('AKERUN-01-V1', 'V1', 'beginner', 'museum-aurora', 4, 31, 1198, 0, 0.96),
  ('AKERUN-02-V1', 'V1', 'beginner', 'reliquary-nocturne', 4, 34, 1201, 0, 0.98),
  ('AKERUN-03-V1', 'V1', 'beginner', 'chronometer-pelagic', 5, 40, 1762, 0, 1.00),
  ('AKERUN-04-V1', 'V1', 'beginner', 'museum-aurora', 5, 42, 1727, 0, 1.01),
  ('AKERUN-05-V1', 'V1', 'beginner', 'reliquary-nocturne', 6, 49, 2376, 0, 1.03),
  ('AKERUN-06-V1', 'V1', 'standard', 'chronometer-pelagic', 4, 36, 1168, 1, 1.01),
  ('AKERUN-07-V1', 'V1', 'standard', 'museum-aurora', 5, 43, 1711, 1, 1.02),
  ('AKERUN-08-V1', 'V1', 'standard', 'reliquary-nocturne', 6, 51, 2328, 1, 1.04),
  ('AKERUN-09-V1', 'V1', 'standard', 'chronometer-pelagic', 5, 46, 1823, 1, 1.05),
  ('AKERUN-10-V1', 'V1', 'standard', 'museum-aurora', 6, 53, 2388, 1, 1.06),
  ('AKERUN-11-V1', 'V1', 'standard', 'reliquary-nocturne', 4, 38, 1168, 1, 1.03),
  ('AKERUN-12-V1', 'V1', 'standard', 'chronometer-pelagic', 6, 54, 2410, 1, 1.07),
  ('AKERUN-13-V1', 'V1', 'standard', 'museum-aurora', 5, 47, 1648, 1, 1.06),
  ('AKERUN-14-V1', 'V1', 'standard', 'reliquary-nocturne', 6, 55, 2340, 1, 1.08),
  ('AKERUN-15-V1', 'V1', 'standard', 'chronometer-pelagic', 5, 48, 1812, 1, 1.05),
  ('AKERUN-16-V1', 'V1', 'advanced', 'museum-aurora', 6, 58, 2428, 2, 1.09),
  ('AKERUN-17-V1', 'V1', 'advanced', 'reliquary-nocturne', 5, 51, 1715, 2, 1.10),
  ('AKERUN-18-V1', 'V1', 'advanced', 'chronometer-pelagic', 6, 60, 2412, 2, 1.11),
  ('AKERUN-19-V1', 'V1', 'advanced', 'museum-aurora', 5, 53, 1769, 2, 1.12),
  ('AKERUN-20-V1', 'V1', 'advanced', 'reliquary-nocturne', 6, 62, 2348, 2, 1.14)
on conflict (problem_id) do update
set problem_version = excluded.problem_version,
    tier = excluded.tier,
    vault_id = excluded.vault_id,
    wheel_count = excluded.wheel_count,
    par_time = excluded.par_time,
    par_dial_steps = excluded.par_dial_steps,
    par_faults = excluded.par_faults,
    difficulty_weight = excluded.difficulty_weight;

create table if not exists private.akerun_runs_v1 (
  run_token uuid primary key default gen_random_uuid(),
  game_slug text not null default 'akerun' check (game_slug = 'akerun'),
  generation text not null check (generation = 'official-problem-v1'),
  client_version text not null check (client_version = 'akerun-web-verified-v1'),
  contract_version text not null check (contract_version = 'akerun-play-v1'),
  display_name text not null,
  normalized_name text not null,
  problem_id text not null references private.akerun_problem_catalog_v1(problem_id),
  problem_version text not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'active', 'completed', 'expired', 'rejected')),
  prepared_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  elapsed_time_ms integer,
  fault_count integer,
  total_dial_steps integer,
  excess_dial_steps integer,
  false_gate_contacts integer,
  observation_accuracy integer,
  score integer,
  score_run_id bigint,
  result_payload jsonb,
  check (problem_version ~ '^V[0-9]+$'),
  check ((status in ('prepared', 'active') and completed_at is null)
      or (status in ('completed', 'expired', 'rejected') and completed_at is not null)),
  check (status <> 'completed'
      or (elapsed_time_ms is not null and fault_count is not null
          and total_dial_steps is not null and excess_dial_steps is not null
          and false_gate_contacts is not null and observation_accuracy is not null
          and score is not null and score_run_id is not null and result_payload is not null))
);

create index if not exists akerun_runs_v1_name_status_idx
  on private.akerun_runs_v1 (normalized_name, status, prepared_at desc);
create index if not exists akerun_runs_v1_expires_idx
  on private.akerun_runs_v1 (status, expires_at);

alter table private.akerun_competition_config enable row level security;
alter table private.akerun_problem_catalog_v1 enable row level security;
alter table private.akerun_runs_v1 enable row level security;

revoke all on table
  private.akerun_competition_config,
  private.akerun_problem_catalog_v1,
  private.akerun_runs_v1
from public, anon, authenticated;
grant all on table
  private.akerun_competition_config,
  private.akerun_problem_catalog_v1,
  private.akerun_runs_v1
to service_role;

-- 旧クライアントや共通の未検証RPCから verified ゲームへ直接書けないようにする。
create or replace function public.submit_score(
  p_display_name text,
  p_game_slug text,
  p_score integer,
  p_client_version text default ''::text
)
returns table(
  accepted boolean,
  result_normalized_name text,
  result_display_name text,
  result_first_score integer,
  result_best_score integer,
  result_play_count integer,
  is_first_play boolean,
  is_new_best boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_game_slug in ('sabaibu_normal', 'sabaibu_endless')
     or exists (
       select 1 from public.games g
       where g.game_slug = p_game_slug
         and g.submission_mode = 'verified'
     )
  then
    raise exception 'verified run required' using errcode = '42501';
  end if;

  return query
  select *
  from public.submit_score_unverified(
    p_display_name, p_game_slug, p_score, p_client_version
  );
end;
$$;

drop function if exists public.akerun_prepare_run_internal(text, text, text);

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

-- 共通の verified score guard に akerun の run ledger を追加する。
create or replace function private.guard_verified_score_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_slug text;
  v_run_token_text text;
  v_run_token uuid;
  v_tomatoku_run private.tomatoku_runs_v1%rowtype;
  v_akerun_run private.akerun_runs_v1%rowtype;
begin
  v_game_slug := case when tg_op = 'DELETE' then old.game_slug else new.game_slug end;

  if v_game_slug in ('sabaibu_normal', 'sabaibu_endless') then
    v_run_token_text := nullif(current_setting('app.sabaibu_verified_run', true), '');
    begin
      v_run_token := v_run_token_text::uuid;
    exception when others then
      raise exception 'verified sabaibu score write requires a valid run';
    end;
    if not exists (
      select 1 from private.sabaibu_run_sessions s
      where s.play_token = v_run_token
        and s.game_slug = v_game_slug
        and s.status in ('started', 'submitted')
        and s.normalized_name = new.normalized_name
    ) then
      raise exception 'verified sabaibu score write requires an active run';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_game_slug = 'akerun' then
    v_run_token_text := nullif(current_setting('app.akerun_verified_run', true), '');
    begin
      v_run_token := v_run_token_text::uuid;
    exception when others then
      raise exception 'verified akerun score write requires a valid run';
    end;
    select * into v_akerun_run
    from private.akerun_runs_v1 r
    where r.run_token = v_run_token
      and r.game_slug = v_game_slug
      and r.status = 'active';
    if not found then
      raise exception 'verified akerun score write requires an active run';
    end if;
    if new.normalized_name is distinct from v_akerun_run.normalized_name then
      raise exception 'verified akerun score write does not match the active run';
    end if;
    if tg_table_name = 'score_runs' then
      if new.score is distinct from v_akerun_run.score
         or new.client_version is distinct from v_akerun_run.client_version
         or new.metadata ->> 'source' is distinct from 'akerun_verified_v1'
      then
        raise exception 'verified akerun score write values do not match the active run';
      end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- 既存 tomatoku / 将来の verified 契約の挙動は維持する。
  if exists (
    select 1 from public.games g
    where g.game_slug = v_game_slug
      and g.submission_mode = 'verified'
  ) then
    if current_setting('app.tomatoku_verified_admin', true) = 'review' then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    v_run_token_text := nullif(current_setting('app.tomatoku_verified_run', true), '');
    begin
      v_run_token := v_run_token_text::uuid;
    exception when others then
      raise exception 'verified score write requires a valid run';
    end;
    select * into v_tomatoku_run
    from private.tomatoku_runs_v1 r
    where r.run_token = v_run_token
      and r.game_slug = v_game_slug
      and r.status = 'active';
    if not found then
      raise exception 'verified score write requires an active run';
    end if;
    if new.normalized_name is distinct from v_tomatoku_run.normalized_name then
      raise exception 'verified score write does not match the active run';
    end if;
    if tg_table_name = 'score_runs' then
      if new.score is distinct from v_tomatoku_run.score
         or new.client_version is distinct from v_tomatoku_run.client_version
      then
        raise exception 'verified score write values do not match the active run';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.akerun_finalize_run_internal(
  p_run_token uuid,
  p_display_name text,
  p_client_version text,
  p_problem_id text,
  p_problem_version text,
  p_elapsed_time_ms integer,
  p_fault_count integer,
  p_total_dial_steps integer,
  p_excess_dial_steps integer,
  p_false_gate_contacts integer,
  p_observation_accuracy integer,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.akerun_competition_config%rowtype;
  v_run private.akerun_runs_v1%rowtype;
  v_problem private.akerun_problem_catalog_v1%rowtype;
  v_normalized_name text;
  v_now timestamptz := clock_timestamp();
  v_time_part integer;
  v_dial_part integer;
  v_difficulty_part integer;
  v_fault_part integer;
  v_false_gate_part integer;
  v_expected_score integer;
  v_excess_dial_steps integer;
  v_observation_accuracy integer;
  v_old_first integer;
  v_old_best integer;
  v_old_play_count integer;
  v_is_first boolean := false;
  v_is_new_best boolean := false;
  v_score_run_id bigint;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('akerun-ranking-v1', 0)
  );

  select * into v_config
  from private.akerun_competition_config c
  where c.singleton = true
  for share;
  if not found then
    raise exception 'akerun ranking configuration is unavailable';
  end if;

  select * into v_run
  from private.akerun_runs_v1 r
  where r.run_token = p_run_token
  for update;
  if not found then
    raise sqlstate 'PT410' using message = 'akerun run is unavailable';
  end if;

  v_normalized_name := public.normalize_player_name(p_display_name);
  if v_run.status = 'completed' then
    if p_display_name is distinct from v_run.display_name
       or p_problem_id is distinct from v_run.problem_id
       or p_problem_version is distinct from v_run.problem_version
       or p_client_version is distinct from v_run.client_version
       or p_elapsed_time_ms is distinct from v_run.elapsed_time_ms
       or p_fault_count is distinct from v_run.fault_count
       or p_total_dial_steps is distinct from v_run.total_dial_steps
       or p_excess_dial_steps is distinct from v_run.excess_dial_steps
       or p_false_gate_contacts is distinct from v_run.false_gate_contacts
       or p_observation_accuracy is distinct from v_run.observation_accuracy
       or p_score is distinct from v_run.score
    then
      raise sqlstate 'PT409' using message = 'akerun completed run does not match this result';
    end if;
    return jsonb_set(coalesce(v_run.result_payload, '{}'::jsonb), '{was_duplicate}', 'true'::jsonb, true);
  end if;

  if v_config.accepting_runs is not true
     or p_client_version is distinct from v_config.client_version
     or v_run.client_version is distinct from v_config.client_version
     or v_run.contract_version is distinct from v_config.contract_version
     or v_run.status is distinct from 'active'
     or v_run.expires_at <= v_now
     or p_display_name is null
     or p_display_name is distinct from v_run.display_name
     or p_display_name is distinct from v_normalized_name
     or p_problem_id is distinct from v_run.problem_id
     or p_problem_version is distinct from v_run.problem_version
  then
    raise exception 'akerun run cannot be finalized';
  end if;
  if not exists (
    select 1 from public.games g
    where g.game_slug = 'akerun'
      and g.is_active = true
      and g.submission_mode = 'verified'
  ) then
    raise sqlstate 'PT503' using message = 'akerun game is not active';
  end if;

  select * into v_problem
  from private.akerun_problem_catalog_v1 p
  where p.problem_id = v_run.problem_id
    and p.problem_version = v_run.problem_version;
  if not found then
    raise exception 'akerun problem contract is unavailable';
  end if;

  if p_elapsed_time_ms is null or p_elapsed_time_ms < 0 or p_elapsed_time_ms > 1800000
     or p_fault_count is null or p_fault_count < 0 or p_fault_count > 1000
     or p_total_dial_steps is null or p_total_dial_steps < 0 or p_total_dial_steps > 100000
     or p_false_gate_contacts is null or p_false_gate_contacts < 0 or p_false_gate_contacts > 10000
     or p_observation_accuracy is null or p_observation_accuracy < 0 or p_observation_accuracy > 100
     or p_score is null or p_score < 0 or p_score > 100000000
  then
    raise exception 'akerun result values are invalid';
  end if;

  v_excess_dial_steps := greatest(0, p_total_dial_steps - v_problem.par_dial_steps);
  v_observation_accuracy := greatest(
    0,
    least(100, 100 - p_false_gate_contacts * 4 - p_fault_count * 8)
  );
  if p_excess_dial_steps is distinct from v_excess_dial_steps
     or p_observation_accuracy is distinct from v_observation_accuracy
  then
    raise exception 'akerun derived metrics do not match the run';
  end if;

  -- JS Math.round の .5 境界と一致させる。
  v_time_part := floor(
    ((v_problem.par_time * 1000 - p_elapsed_time_ms)::numeric * 120 / 1000) + 0.5
  )::integer;
  v_dial_part := floor(
    ((v_problem.par_dial_steps - p_total_dial_steps)::numeric * 6) + 0.5
  )::integer;
  v_difficulty_part := floor(v_problem.difficulty_weight * 1000 + 0.5)::integer;
  v_fault_part := floor(
    ((p_fault_count - v_problem.par_faults)::numeric * 650) + 0.5
  )::integer;
  v_false_gate_part := floor(p_false_gate_contacts * 35 + 0.5)::integer;
  v_expected_score := greatest(
    0,
    8000 + v_difficulty_part + v_time_part + v_dial_part
      - v_fault_part - v_false_gate_part
  );
  if p_score is distinct from v_expected_score then
    raise exception 'akerun score does not match the problem contract';
  end if;

  update private.akerun_runs_v1
  set elapsed_time_ms = p_elapsed_time_ms,
      fault_count = p_fault_count,
      total_dial_steps = p_total_dial_steps,
      excess_dial_steps = p_excess_dial_steps,
      false_gate_contacts = p_false_gate_contacts,
      observation_accuracy = p_observation_accuracy,
      score = p_score
  where run_token = p_run_token;

  perform set_config('app.akerun_verified_run', p_run_token::text, true);

  insert into public.players (
    normalized_name, display_name, created_at, last_played_at
  ) values (
    v_run.normalized_name, v_run.display_name, v_now, v_now
  )
  on conflict (normalized_name) do update
  set display_name = excluded.display_name,
      last_played_at = excluded.last_played_at;

  insert into public.score_runs (
    normalized_name, game_slug, score, client_version, created_at, metadata
  ) values (
    v_run.normalized_name,
    v_run.game_slug,
    p_score,
    v_run.client_version,
    v_now,
    jsonb_build_object(
      'source', 'akerun_verified_v1',
      'verification', 'server-contract-v1',
      'generation', v_run.generation,
      'contract_version', v_run.contract_version,
      'problem_id', v_run.problem_id,
      'problem_version', v_run.problem_version,
      'difficulty', v_problem.tier,
      'vault_id', v_problem.vault_id,
      'elapsed_time_ms', p_elapsed_time_ms,
      'fault_count', p_fault_count,
      'total_dial_steps', p_total_dial_steps,
      'excess_dial_steps', p_excess_dial_steps,
      'false_gate_contacts', p_false_gate_contacts,
      'observation_accuracy', p_observation_accuracy,
      'display_name', v_run.display_name,
      'run_token', p_run_token::text
    )
  )
  returning id into v_score_run_id;

  select gs.first_score, gs.best_score, gs.play_count
  into v_old_first, v_old_best, v_old_play_count
  from public.game_scores gs
  where gs.normalized_name = v_run.normalized_name
    and gs.game_slug = v_run.game_slug
    and coalesce(gs.ranking_status, 'normal') = 'normal'
  for update;

  if not found then
    v_is_first := true;
    v_is_new_best := true;
    insert into public.game_scores (
      normalized_name, game_slug, display_name, first_score, best_score, play_count,
      first_score_at, best_score_at, updated_at, ranking_status
    ) values (
      v_run.normalized_name, v_run.game_slug, v_run.display_name, p_score, p_score, 1,
      v_now, v_now, v_now, 'normal'
    );
    v_old_best := p_score;
    v_old_play_count := 1;
  else
    v_is_new_best := p_score > v_old_best;
    update public.game_scores gs
    set display_name = v_run.display_name,
        best_score = case when v_is_new_best then p_score else v_old_best end,
        play_count = v_old_play_count + 1,
        best_score_at = case when v_is_new_best then v_now else gs.best_score_at end,
        updated_at = v_now,
        ranking_status = 'normal',
        ranking_note = null,
        ranking_status_updated_at = null
    where gs.normalized_name = v_run.normalized_name
      and gs.game_slug = v_run.game_slug;
    v_old_best := case when v_is_new_best then p_score else v_old_best end;
    v_old_play_count := v_old_play_count + 1;
  end if;

  v_result := jsonb_build_object(
    'accepted', true,
    'problem_id', v_run.problem_id,
    'problem_version', v_run.problem_version,
    'score', p_score,
    'result_first_score', case when v_is_first then p_score else v_old_first end,
    'result_best_score', v_old_best,
    'result_play_count', v_old_play_count,
    'is_first_play', v_is_first,
    'is_new_best', v_is_new_best,
    'under_review', false,
    'was_duplicate', false
  );

  update private.akerun_runs_v1
  set status = 'completed',
      completed_at = v_now,
      score_run_id = v_score_run_id,
      result_payload = v_result
  where run_token = p_run_token;

  return v_result;
end;
$$;

create or replace function public.get_akerun_ranking_v1(
  p_limit integer default 100
)
returns table(
  rank_no bigint,
  display_name text,
  first_score integer,
  best_score integer,
  play_count integer,
  fault_count integer,
  elapsed_time_ms integer,
  excess_dial_steps integer,
  problem_id text,
  problem_version text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  with best_runs as (
    select
      gs.normalized_name,
      gs.display_name,
      gs.first_score,
      gs.best_score,
      gs.play_count,
      gs.updated_at,
      best_run.metadata,
      row_number() over (
        order by
          gs.best_score desc,
          case when best_run.metadata ->> 'fault_count' ~ '^[0-9]+$'
            then (best_run.metadata ->> 'fault_count')::integer else 2147483647 end asc,
          case when best_run.metadata ->> 'elapsed_time_ms' ~ '^[0-9]+$'
            then (best_run.metadata ->> 'elapsed_time_ms')::integer else 2147483647 end asc,
          case when best_run.metadata ->> 'excess_dial_steps' ~ '^[0-9]+$'
            then (best_run.metadata ->> 'excess_dial_steps')::integer else 2147483647 end asc,
          gs.normalized_name asc
      ) as rank_no
    from public.game_scores gs
    left join lateral (
      select sr.metadata
      from public.score_runs sr
      where sr.game_slug = 'akerun'
        and sr.normalized_name = gs.normalized_name
        and sr.score = gs.best_score
        and sr.metadata ->> 'source' = 'akerun_verified_v1'
      order by
        case when sr.metadata ->> 'fault_count' ~ '^[0-9]+$'
          then (sr.metadata ->> 'fault_count')::integer else 2147483647 end asc,
        case when sr.metadata ->> 'elapsed_time_ms' ~ '^[0-9]+$'
          then (sr.metadata ->> 'elapsed_time_ms')::integer else 2147483647 end asc,
        case when sr.metadata ->> 'excess_dial_steps' ~ '^[0-9]+$'
          then (sr.metadata ->> 'excess_dial_steps')::integer else 2147483647 end asc,
        sr.created_at asc,
        sr.id asc
      limit 1
    ) best_run on true
    where gs.game_slug = 'akerun'
      and coalesce(gs.ranking_status, 'normal') = 'normal'
  )
  select
    best_runs.rank_no,
    best_runs.display_name,
    best_runs.first_score,
    best_runs.best_score,
    best_runs.play_count,
    case when best_runs.metadata ->> 'fault_count' ~ '^[0-9]+$'
      then (best_runs.metadata ->> 'fault_count')::integer else null end,
    case when best_runs.metadata ->> 'elapsed_time_ms' ~ '^[0-9]+$'
      then (best_runs.metadata ->> 'elapsed_time_ms')::integer else null end,
    case when best_runs.metadata ->> 'excess_dial_steps' ~ '^[0-9]+$'
      then (best_runs.metadata ->> 'excess_dial_steps')::integer else null end,
    best_runs.metadata ->> 'problem_id',
    best_runs.metadata ->> 'problem_version',
    best_runs.updated_at
  from best_runs
  order by best_runs.rank_no
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.akerun_prepare_run_internal(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.akerun_begin_run_internal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.akerun_finalize_run_internal(
  uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.get_akerun_ranking_v1(integer)
  from public, anon, authenticated;

grant execute on function public.akerun_prepare_run_internal(text, text, text, uuid)
  to service_role;
grant execute on function public.akerun_begin_run_internal(uuid, text)
  to service_role;
grant execute on function public.akerun_finalize_run_internal(
  uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer
) to service_role;
grant execute on function public.get_akerun_ranking_v1(integer)
  to anon, authenticated;

alter default privileges in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;

comment on table private.akerun_problem_catalog_v1 is
  'Server-side copy of the immutable official akerun problem IDs and score par values.';
comment on table private.akerun_runs_v1 is
  'Server-issued akerun play ledger. One run token can finalize at most once.';
comment on function public.akerun_prepare_run_internal(text, text, text, uuid) is
  'Internal service-role RPC that fixes one official akerun problem; explicit problem selection requires a completed same-problem replay token.';
comment on function public.akerun_begin_run_internal(uuid, text) is
  'Internal service-role RPC that activates a prepared akerun play token.';
comment on function public.akerun_finalize_run_internal(uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer) is
  'Internal service-role RPC that recomputes and records one verified akerun result.';
comment on function public.get_akerun_ranking_v1(integer) is
  'Public akerun ranking read using shared Chameleon JP ranking tables and metric tie-breaks.';
