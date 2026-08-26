-- Keep foreign-key lookups on the private Akerun run ledger indexed.
create index if not exists akerun_runs_v1_problem_id_idx
  on private.akerun_runs_v1 (problem_id);
