# Connect Supabase

The application works locally without credentials. The cloud path is implemented and tested with a local Supabase stack; activation of the remote project requires the account details.

## Remote activation

1. Create or select the Supabase project. Use its project URL and **publishable key**. Never put a secret key or service-role key in a `VITE_` variable.
2. Apply `supabase/migrations/202610160001_workspaces.sql` with the Supabase SQL editor, or link the CLI to the intended project and run `supabase db push`. Review the target project before applying a remote migration.
3. Configure Supabase Auth's Site URL and allowed redirect URLs for the app's actual origin. Email confirmation and password recovery use that origin; enable your intended email provider. This release uses email/password authentication.
4. Copy `.env.example` to `.env.local`, set `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite. For deployment, set those same build-time variables and rebuild.
5. Sign up and confirm the email if confirmation is enabled. The account creates its first empty workspace; demonstration records never enter the cloud account.

Partial or invalid cloud configuration shows an error. Auth, network or database errors never silently fall back to local demo mode.

## Membership

Workspace creation atomically inserts the owner and the first snapshot. Additional users must already have an Auth account. Provision membership from an administrative session, substituting actual workspace/user UUIDs:

```sql
insert into public.workspace_memberships (workspace_id, user_id, role)
values ('workspace-uuid', 'auth-user-uuid', 'member');
```

Roles are `owner`, `admin`, `member` and `guest`. Guests can only read. Owner/admin can rename the workspace; member can edit project/task content. The browser cannot edit the membership table. `workspace_role`, the RLS policies and restricted write functions enforce tenant isolation independently of the UI. Project privacy and invitations shown in the original local prototype are not cloud authorization controls.

## Existing local data

The old `gr8r.v2` record migrates to one workspace in `gr8r.workspaces.v1`. Other workspace labels become empty workspaces; migration never clones the old tasks into every tenant. The legacy record is retained. Language and other personal preferences are migrated separately. A corrupt or unwritable store reports an error instead of silently resetting data.

Switching to Supabase leaves local data on the device. Use **Export draft** to obtain a JSON copy. Importing that data into a real cloud organization requires an explicit mapping of members and project visibility, so this release does not upload it automatically.

## Conflicts and failures

Writes carry an expected revision. Another browser's successful write causes an outdated revision to fail. The error banner retains the unsaved draft, offers export, and requires explicit confirmation before discarding changes and reloading. A failed save blocks workspace switching. Deferred callbacks and undo operations are bound to the originating workspace session.

## Verification

```sh
npm test                 # local adapter, migrations, RLS, revisions, language, tokens
npm run test:e2e          # local browser flows
sh supabase/tests/run-postgres.sh  # Docker PostgreSQL smoke
```

The repository includes a local Supabase configuration on ports 61920–61929 to avoid existing projects. See `supabase/tests/` and the workspace integration tests for optional SDK end-to-end checks. The schema tests run through PGlite in the normal test suite and have also been run against PostgreSQL 17.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [publishable keys](https://supabase.com/docs/guides/getting-started/api-keys), [local development](https://supabase.com/docs/guides/local-development/cli/getting-started).
