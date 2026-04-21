-- Performance indexes for Today/Execute hot paths
CREATE INDEX IF NOT EXISTS "PlannedSession_user_status_date_sequence_idx"
ON "PlannedSession" ("user_id", "status", "session_date", "sequence_index");

CREATE INDEX IF NOT EXISTS "SessionExecution_planned_user_status_perf_created_idx"
ON "SessionExecution" ("planned_session_id", "user_id", "completion_status", "performed_at", "created_at");

CREATE INDEX IF NOT EXISTS "SessionExecution_active_partial_idx"
ON "SessionExecution" ("planned_session_id", "user_id", "performed_at", "created_at")
WHERE "completion_status" = 'partial';

CREATE INDEX IF NOT EXISTS "SessionExecutionSet_session_set_index_created_idx"
ON "SessionExecutionSet" ("session_execution_id", "set_index", "created_at");
