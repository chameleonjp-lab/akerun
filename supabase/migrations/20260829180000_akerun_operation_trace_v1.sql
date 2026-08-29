-- Akerun operation trace v1: replay the deterministic route before any score write.
-- The raw trace is retained with the private run ledger for audit and duplicate retries.

alter table private.akerun_runs_v1
  add column if not exists operation_trace jsonb,
  add column if not exists operation_trace_event_count integer,
  add column if not exists operation_trace_hash text;

alter table private.akerun_runs_v1
  drop constraint if exists akerun_run_operation_trace_event_count_ck,
  add constraint akerun_run_operation_trace_event_count_ck
    check (operation_trace_event_count is null
      or operation_trace_event_count between 1 and 8192),
  drop constraint if exists akerun_run_operation_trace_hash_ck,
  add constraint akerun_run_operation_trace_hash_ck
    check (operation_trace_hash is null or char_length(operation_trace_hash) = 32);

comment on column private.akerun_runs_v1.operation_trace is
  'Versioned ordered dial and actuator operations replayed by the server before finalization.';
comment on column private.akerun_runs_v1.operation_trace_event_count is
  'Number of accepted operation trace events.';
comment on column private.akerun_runs_v1.operation_trace_hash is
  'MD5 of the stored JSONB trace for duplicate and forensic comparison.';

drop function if exists public.akerun_finalize_run_internal(uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer);

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
  p_score integer,
  p_operation_trace jsonb
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
  v_server_elapsed_ms integer;
  v_operation_trace_event_count integer;
  v_operation_trace_hash text;
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
       or p_operation_trace is distinct from v_run.operation_trace
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
     or v_run.started_at is null
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

  v_server_elapsed_ms := greatest(
    0,
    floor(extract(epoch from (v_now - v_run.started_at)) * 1000)::integer
  );
  if p_elapsed_time_ms is null
     or p_elapsed_time_ms < 1000
     or p_elapsed_time_ms + 3000 < v_server_elapsed_ms
  then
    raise exception 'akerun elapsed time is below the server timing floor';
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

  if p_total_dial_steps < v_problem.minimum_dial_steps then
    raise exception 'akerun dial route is below the problem minimum';
  end if;

  if p_operation_trace is null
     or pg_catalog.jsonb_typeof(p_operation_trace) is distinct from 'object'
     or p_operation_trace ->> 'version' is distinct from '1'
     or p_operation_trace ->> 'truncated' is distinct from 'false'
     or pg_catalog.jsonb_typeof(p_operation_trace -> 'events') is distinct from 'array'
     or case
          when pg_catalog.jsonb_typeof(p_operation_trace -> 'events') = 'array'
            then pg_catalog.jsonb_array_length(p_operation_trace -> 'events')
          else 0
        end < 1
     or case
          when pg_catalog.jsonb_typeof(p_operation_trace -> 'events') = 'array'
            then pg_catalog.jsonb_array_length(p_operation_trace -> 'events')
          else 0
        end > 8192
  then
    raise exception 'akerun operation trace is invalid';
  end if;
  v_operation_trace_event_count := pg_catalog.jsonb_array_length(p_operation_trace -> 'events');
  v_operation_trace_hash := pg_catalog.md5(p_operation_trace::text);

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
  set server_elapsed_time_ms = v_server_elapsed_ms,
      elapsed_time_ms = p_elapsed_time_ms,
      fault_count = p_fault_count,
      total_dial_steps = p_total_dial_steps,
      excess_dial_steps = p_excess_dial_steps,
      false_gate_contacts = p_false_gate_contacts,
      observation_accuracy = p_observation_accuracy,
      score = p_score,
      operation_trace = p_operation_trace,
      operation_trace_event_count = v_operation_trace_event_count,
      operation_trace_hash = v_operation_trace_hash
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
      'source', 'akerun_verified_v2',
      'verification', 'server-contract-v2',
      'generation', v_run.generation,
      'contract_version', v_run.contract_version,
      'problem_id', v_run.problem_id,
      'problem_version', v_run.problem_version,
      'difficulty', v_problem.tier,
      'vault_id', v_problem.vault_id,
      'elapsed_time_ms', p_elapsed_time_ms,
      'server_elapsed_time_ms', v_server_elapsed_ms,
      'server_timing_tolerance_ms', 3000,
      'fault_count', p_fault_count,
      'total_dial_steps', p_total_dial_steps,
      'excess_dial_steps', p_excess_dial_steps,
      'false_gate_contacts', p_false_gate_contacts,
      'observation_accuracy', p_observation_accuracy,
      'display_name', v_run.display_name,
      'run_token', p_run_token::text,
      'operation_trace_version', 1,
      'operation_trace_event_count', v_operation_trace_event_count,
      'operation_trace_hash', v_operation_trace_hash
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

revoke all on function public.akerun_finalize_run_internal(uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.akerun_finalize_run_internal(uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb)
  to service_role;

comment on function public.akerun_finalize_run_internal(uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer, jsonb) is
  'Internal service-role RPC that accepts only a server-replayed, score-consistent Akerun result.';
