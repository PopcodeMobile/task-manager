-- One label per name in a workspace, ignoring case and surrounding spaces.
-- Concurrent create_label calls (agents or people) otherwise duplicate a tag such as `cockpit`.
-- A collision surfaces as unique_violation, which execute_operation already maps to validation_error (PT422).
create unique index labels_workspace_name_ux on public.labels (workspace_id, lower(btrim(name)));
