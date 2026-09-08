-- Akerun PR2 rule/transport contract v4.
--
-- The V3 score formula remains the same.  V4 identifies the new gameplay
-- semantics (confirmed stops and full forward revolutions) so an old browser
-- cannot submit a V3 trace under the new shared replay rules.

update public.games
set is_active = false
where game_slug = 'akerun';

alter table private.akerun_competition_config
  drop constraint if exists akerun_competition_config_client_version_check,
  drop constraint if exists akerun_competition_config_contract_version_check;

alter table private.akerun_runs_v1
  drop constraint if exists akerun_runs_v1_client_version_check,
  drop constraint if exists akerun_runs_v1_contract_version_check;

update private.akerun_competition_config
set client_version = 'akerun-web-verified-v4',
    contract_version = 'akerun-play-v4',
    accepting_runs = false,
    updated_at = clock_timestamp()
where singleton = true;

alter table private.akerun_competition_config
  add constraint akerun_competition_config_client_version_check
    check (client_version = 'akerun-web-verified-v4'),
  add constraint akerun_competition_config_contract_version_check
    check (contract_version = 'akerun-play-v4');

alter table private.akerun_runs_v1
  add constraint akerun_runs_v1_client_version_check
    check (client_version in (
      'akerun-web-verified-v1',
      'akerun-web-verified-v2',
      'akerun-web-verified-v3',
      'akerun-web-verified-v4'
    )),
  add constraint akerun_runs_v1_contract_version_check
    check (contract_version in (
      'akerun-play-v1',
      'akerun-play-v2',
      'akerun-play-v3',
      'akerun-play-v4'
    ));

-- Keep historical V1/V2/V3 aggregates for audit, but do not mix them with the
-- first V4 rule result when the release gate is eventually opened.
update public.game_scores
set ranking_status = 'hidden',
    ranking_note = 'Akerun V1/V2/V3 score contracts archived; V4 rules start a separate aggregate.',
    ranking_status_updated_at = clock_timestamp()
where game_slug = 'akerun'
  and coalesce(ranking_status, 'normal') <> 'hidden';

-- The immediately previous migration generated the active RPC bodies from the
-- V3 definitions. Replace only those current entry points in place so their
-- checks, metadata markers, and ranking filters all require V4.
do $migration$
declare
  v_definition text;
  v_function record;
begin
  for v_function in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'guard_verified_score_write',
        'akerun_prepare_run_internal',
        'akerun_prepare_competition_run_internal',
        'akerun_finalize_run_internal',
        'get_akerun_ranking_v2',
        'get_akerun_daily_ranking_v2'
      )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('akerun-web-verified-v3' in v_definition) > 0
       or position('akerun-play-v3' in v_definition) > 0
       or position('akerun_verified_v3' in v_definition) > 0
       or position('server-contract-v3' in v_definition) > 0
    then
      v_definition := replace(v_definition, 'akerun-web-verified-v3', 'akerun-web-verified-v4');
      v_definition := replace(v_definition, 'akerun-play-v3', 'akerun-play-v4');
      v_definition := replace(v_definition, 'akerun_verified_v3', 'akerun_verified_v4');
      v_definition := replace(v_definition, 'server-contract-v3', 'server-contract-v4');
      execute v_definition;
    end if;
  end loop;
end
$migration$;

comment on table private.akerun_competition_config is
  'Akerun release gate and current score/transport contract. V4 adds confirmed-stop and full-revolution rule semantics while retaining the V3 score formula.';

comment on column private.akerun_runs_v1.contract_version is
  'Akerun transport/rule contract. V4 is required for confirmed-stop and full-revolution traces.';
