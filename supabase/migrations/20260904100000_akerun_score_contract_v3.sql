-- Akerun score contract v3.
--
-- The official puzzle catalog remains the fixed V1 catalog. This migration
-- versions the scoring/transport contract separately so historical V1/V2
-- score rows cannot be aggregated into the new ranking. Reception stays disabled
-- until the production release gate is opened.

update public.games
set description = '音・抵抗・内部機構を観察しながら、4〜6輪の金庫を開けるゲームです。',
    is_active = false
where game_slug = 'akerun';

alter table private.akerun_competition_config
  drop constraint if exists akerun_competition_config_client_version_check,
  drop constraint if exists akerun_competition_config_contract_version_check;

alter table private.akerun_runs_v1
  drop constraint if exists akerun_runs_v1_client_version_check,
  drop constraint if exists akerun_runs_v1_contract_version_check;

update private.akerun_competition_config
set client_version = 'akerun-web-verified-v3',
    contract_version = 'akerun-play-v3',
    accepting_runs = false,
    updated_at = clock_timestamp()
where singleton = true;

alter table private.akerun_competition_config
  add constraint akerun_competition_config_client_version_check
    check (client_version = 'akerun-web-verified-v3'),
  add constraint akerun_competition_config_contract_version_check
    check (contract_version = 'akerun-play-v3');

alter table private.akerun_runs_v1
  add constraint akerun_runs_v1_client_version_check
    check (client_version in (
      'akerun-web-verified-v1',
      'akerun-web-verified-v2',
      'akerun-web-verified-v3'
    )),
  add constraint akerun_runs_v1_contract_version_check
    check (contract_version in (
      'akerun-play-v1',
      'akerun-play-v2',
      'akerun-play-v3'
    ));

comment on column private.akerun_runs_v1.false_gate_contacts is
  'Akerun V3: avoidable false-gate contacts above the problem-specific unavoidable baseline.';
comment on table private.akerun_competition_config is
  'Akerun release gate and current score/transport contract. V3 uses a human-scaled provisional observation-time reference.';

-- Akerun's shared game_scores row is unique per player/game. Archive any
-- aggregate that was built before V3 begins, then let the V3 finalizer reuse
-- that row as a fresh V3 aggregate on the first new run.
update public.game_scores
set ranking_status = 'hidden',
    ranking_note = 'Akerun V1 score contract archived; V3 starts a separate aggregate.',
    ranking_status_updated_at = clock_timestamp()
where game_slug = 'akerun'
  and coalesce(ranking_status, 'normal') <> 'hidden';

-- The shared score trigger is also part of the contract boundary. It must
-- recognize the V3 metadata marker before the first V3 score is inserted.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'guard_verified_score_write'
    and pg_get_function_identity_arguments(p.oid) = ''
  order by p.oid desc
  limit 1;

  if v_definition is null
     or position($$new.metadata ->> 'source' is distinct from 'akerun_verified_v2'$$ in v_definition) = 0
  then
    raise exception 'Akerun score guard v2 marker was not found';
  end if;
  v_definition := replace(
    v_definition,
    $$new.metadata ->> 'source' is distinct from 'akerun_verified_v2'$$,
    $$new.metadata ->> 'source' is distinct from 'akerun_verified_v3'$$
  );
  execute v_definition;
end
$migration$;

-- The existing verified RPCs are retained for historical rows, but their
-- preparation/finalization entry points now enforce the V3 configuration.
-- pg_get_functiondef keeps the migration aligned with the immediately prior
-- function body and fails closed if the production schema has drifted.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'akerun_prepare_run_internal'
    and p.pronargs = 4
  order by p.oid desc
  limit 1;

  if v_definition is null
     or position($$'akerun-web-verified-v2'$$ in v_definition) = 0
  then
    raise exception 'Akerun prepare v2 marker was not found';
  end if;
  v_definition := replace(
    v_definition,
    $$'akerun-web-verified-v2'$$,
    $$'akerun-web-verified-v3'$$
  );
  execute v_definition;

  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'akerun_prepare_competition_run_internal'
    and p.pronargs = 2
  order by p.oid desc
  limit 1;

  if v_definition is null
     or position($$'akerun-web-verified-v2'$$ in v_definition) = 0
  then
    raise exception 'Akerun competition prepare v2 marker was not found';
  end if;
  v_definition := replace(
    v_definition,
    $$'akerun-web-verified-v2'$$,
    $$'akerun-web-verified-v3'$$
  );
  execute v_definition;

  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'akerun_finalize_run_internal'
    and p.pronargs = 13
  order by p.oid desc
  limit 1;

  if v_definition is null
     or position($$'akerun_verified_v2'$$ in v_definition) = 0
     or position($$'server-contract-v2'$$ in v_definition) = 0
  then
    raise exception 'Akerun finalize v2 markers were not found';
  end if;

  v_definition := replace(
    v_definition,
    $$  v_time_part integer;
  v_dial_part integer;$$,
    $$  v_time_part integer;
  v_speed_part integer;
  v_dial_part integer;$$
  );
  v_definition := replace(
    v_definition,
    $$v_time_part := floor(
    ((v_problem.par_time * 1000 - p_elapsed_time_ms)::numeric * 120 / 1000) + 0.5
  )::integer;$$,
    $$v_time_part := greatest(
    -1800,
    least(
      500,
      floor(
        ((v_problem.par_time * 10 * 1000 - p_elapsed_time_ms)::numeric * 5 / 1000) + 0.5
      )::integer
    )
  );$$
  );
  v_definition := replace(
    v_definition,
    $$v_dial_part := floor(
    ((v_problem.par_dial_steps - p_total_dial_steps)::numeric * 6) + 0.5
  )::integer;$$,
    $$v_speed_part := floor(
    greatest(
      0,
      ((60000 - p_elapsed_time_ms)::numeric * 32 / 1000) + 0.5
    )
  )::integer;
  v_dial_part := greatest(
    -900,
    least(
      600,
      floor(
        ((v_problem.par_dial_steps - p_total_dial_steps)::numeric * 1.5) + 0.5
      )::integer
    )
  );$$
  );
  v_definition := replace(
    v_definition,
    $$v_fault_part := floor(
    ((p_fault_count - v_problem.par_faults)::numeric * 650) + 0.5
  )::integer;$$,
    $$v_fault_part := case
    when p_fault_count >= v_problem.par_faults
      then (p_fault_count - v_problem.par_faults) * 500
    else (p_fault_count - v_problem.par_faults) * 100
  end;$$
  );
  v_definition := replace(
    v_definition,
    $$v_false_gate_part := floor(p_false_gate_contacts * 35 + 0.5)::integer;$$,
    $$v_false_gate_part := p_false_gate_contacts * 12;$$
  );
  v_definition := replace(
    v_definition,
    $$    8000 + v_difficulty_part + v_time_part + v_dial_part$$,
    $$    7600 + v_difficulty_part + v_time_part + v_speed_part + v_dial_part$$
  );

  if position($$v_time_part := greatest($$ in v_definition) = 0
     or position($$v_speed_part := floor($$ in v_definition) = 0
     or position($$v_dial_part := greatest($$ in v_definition) = 0
     or position($$v_fault_part := case$$ in v_definition) = 0
     or position($$v_false_gate_part := p_false_gate_contacts * 12;$$ in v_definition) = 0
     or position($$    7600 + v_difficulty_part + v_time_part + v_speed_part + v_dial_part$$ in v_definition) = 0
  then
    raise exception 'Akerun V3 score formula replacement failed';
  end if;

  v_definition := replace(
    v_definition,
    $$'akerun_verified_v2'$$,
    $$'akerun_verified_v3'$$
  );
  v_definition := replace(
    v_definition,
    $$'server-contract-v2'$$,
    $$'server-contract-v3'$$
  );
  v_definition := replace(
    v_definition,
    $$'akerun-ranking-v1'$$,
    $$'akerun-ranking-v3'$$
  );

  -- A pre-V3 game_scores row was archived above. Reuse it as a clean aggregate
  -- instead of violating the shared table's normalized_name/game_slug key.
  if position($$  if not found then
    v_is_first := true;$$ in v_definition) = 0
  then
    raise exception 'Akerun game_scores reset marker was not found';
  end if;
  v_definition := replace(
    v_definition,
    $$  if not found then
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
  else$$,
    $$  if not found then
    select gs.first_score, gs.best_score, gs.play_count
    into v_old_first, v_old_best, v_old_play_count
    from public.game_scores gs
    where gs.normalized_name = v_run.normalized_name
      and gs.game_slug = v_run.game_slug
      and gs.ranking_status = 'hidden'
    for update;

    if found then
      v_is_first := true;
      v_is_new_best := true;
      update public.game_scores gs
      set display_name = v_run.display_name,
          first_score = p_score,
          best_score = p_score,
          play_count = 1,
          first_score_at = v_now,
          best_score_at = v_now,
          updated_at = v_now,
          ranking_status = 'normal',
          ranking_note = null,
          ranking_status_updated_at = null
      where gs.normalized_name = v_run.normalized_name
        and gs.game_slug = v_run.game_slug;
      v_old_best := p_score;
      v_old_play_count := 1;
    else
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
    end if;
  else$$
  );
  execute v_definition;
end
$migration$;

-- Only V3 score_runs are eligible for the current official ranking. Keep the
-- historical v1 function available for forensic reads, but do not let the UI
-- query it after the contract switch.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_akerun_ranking_v1'
    and p.pronargs = 1
  order by p.oid desc
  limit 1;

  if v_definition is null
     or position($$sr.metadata ->> 'source' in ('akerun_verified_v1', 'akerun_verified_v2')$$ in v_definition) = 0
  then
    raise exception 'Akerun ranking v1 source marker was not found';
  end if;
  v_definition := replace(
    v_definition,
    $$get_akerun_ranking_v1$$,
    $$get_akerun_ranking_v2$$
  );
  v_definition := replace(
    v_definition,
    $$sr.metadata ->> 'source' in ('akerun_verified_v1', 'akerun_verified_v2')$$,
    $$sr.metadata ->> 'source' = 'akerun_verified_v3'$$
  );
  execute v_definition;
end
$migration$;

revoke all on function public.get_akerun_ranking_v1(integer)
  from public, anon, authenticated;
revoke all on function public.get_akerun_daily_ranking_v1(date)
  from public, anon, authenticated;

revoke all on function public.get_akerun_ranking_v2(integer)
  from public, anon, authenticated;
grant execute on function public.get_akerun_ranking_v2(integer)
  to anon, authenticated;
comment on function public.get_akerun_ranking_v2(integer) is
  'Akerun V3 official ranking. Historical V1/V2 score_runs are excluded.';

drop function if exists public.get_akerun_daily_ranking_v2(date);
create function public.get_akerun_daily_ranking_v2(
  p_competition_day date default (
    pg_catalog.timezone('Asia/Tokyo', pg_catalog.now())::date
  )
)
returns table(
  rank_no bigint,
  display_name text,
  score integer,
  fault_count integer,
  elapsed_time_ms integer,
  excess_dial_steps integer,
  problem_id text,
  problem_version text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    pg_catalog.row_number() over (
      order by
        s.score desc,
        s.fault_count asc,
        s.elapsed_time_ms asc,
        s.excess_dial_steps asc,
        s.submitted_at asc,
        s.run_token asc
    ) as rank_no,
    s.display_name,
    s.score,
    s.fault_count,
    s.elapsed_time_ms,
    s.excess_dial_steps,
    s.problem_id,
    s.problem_version,
    s.submitted_at
  from private.akerun_competition_scores_v1 s
  join private.akerun_runs_v1 r
    on r.run_token = s.run_token
   and r.client_version = 'akerun-web-verified-v3'
   and r.contract_version = 'akerun-play-v3'
  where s.competition_day = coalesce(
    p_competition_day,
    pg_catalog.timezone('Asia/Tokyo', pg_catalog.now())::date
  )
  order by
    s.score desc,
    s.fault_count asc,
    s.elapsed_time_ms asc,
    s.excess_dial_steps asc,
    s.submitted_at asc,
    s.run_token asc
  limit 100;
$function$;

revoke all on function public.get_akerun_daily_ranking_v2(date)
  from public, anon, authenticated;
grant execute on function public.get_akerun_daily_ranking_v2(date)
  to anon, authenticated;
comment on function public.get_akerun_daily_ranking_v2(date) is
  '指定した日本時間の日付のAkerun V3競技結果を最大100件返す。';
