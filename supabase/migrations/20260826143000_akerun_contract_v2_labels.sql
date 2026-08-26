-- Akerun v2 result metadata labels.
--
-- Keep the historical function names and completed v1 rows for compatibility,
-- but label new finalized results as v2. The exact markers are checked before
-- replacement so this migration fails closed if production has drifted.
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
  order by p.oid
  limit 1;

  if v_definition is null
     or position($$'akerun_verified_v1'$$ in v_definition) = 0 then
    raise exception 'Akerun guard v1 marker was not found';
  end if;

  v_definition := replace(
    v_definition,
    $$'akerun_verified_v1'$$,
    $$'akerun_verified_v2'$$
  );
  execute v_definition;

  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'akerun_finalize_run_internal'
    and pg_get_function_identity_arguments(p.oid) =
      'p_run_token uuid, p_display_name text, p_client_version text, p_problem_id text, p_problem_version text, p_elapsed_time_ms integer, p_fault_count integer, p_total_dial_steps integer, p_excess_dial_steps integer, p_false_gate_contacts integer, p_observation_accuracy integer, p_score integer'
  order by p.oid
  limit 1;

  if v_definition is null
     or position($$'akerun_verified_v1'$$ in v_definition) = 0
     or position($$'server-contract-v1'$$ in v_definition) = 0 then
    raise exception 'Akerun finalize v1 markers were not found';
  end if;

  v_definition := replace(
    v_definition,
    $$'akerun_verified_v1'$$,
    $$'akerun_verified_v2'$$
  );
  v_definition := replace(
    v_definition,
    $$'server-contract-v1'$$,
    $$'server-contract-v2'$$
  );
  execute v_definition;

  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_akerun_ranking_v1'
    and pg_get_function_identity_arguments(p.oid) = 'p_limit integer'
  order by p.oid
  limit 1;

  if v_definition is null
     or position($$sr.metadata ->> 'source' = 'akerun_verified_v1'$$ in v_definition) = 0 then
    raise exception 'Akerun ranking v1 source filter was not found';
  end if;

  v_definition := replace(
    v_definition,
    $$sr.metadata ->> 'source' = 'akerun_verified_v1'$$,
    $$sr.metadata ->> 'source' in ('akerun_verified_v1', 'akerun_verified_v2')$$
  );
  execute v_definition;
end
$migration$;
