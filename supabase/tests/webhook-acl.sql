-- Deployment regression: migration executes as Supabase's NOSUPERUSER postgres, not supabase_admin.
do $$declare r text; obj text;begin
 if (select rolsuper from pg_roles where rolname='postgres') then raise exception 'migration role was elevated';end if;
 if pg_has_role('postgres','supabase_admin','member') then raise exception 'migration role must not inherit vendor superuser';end if;
 if (select pg_get_userbyid(proowner)<>'postgres' from pg_proc where oid='public.webhook_delivery_secret(uuid,uuid)'::regprocedure) then raise exception 'worker helper must be owned by restricted migration role';end if;
 if (select pg_get_userbyid(relowner)<>'postgres' from pg_class where oid='public.webhook_deliveries'::regclass) then raise exception 'ledger must be owned by restricted migration role';end if;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vault' and pg_get_userbyid(p.proowner)='supabase_admin' and not has_function_privilege('postgres',p.oid,'execute')) then raise exception 'vendor primitive access was weakened';end if;
 if not has_schema_privilege('anon','net','usage') or not has_table_privilege('authenticated','net.http_request_queue','select') then raise exception 'fixture must preserve supported vendor net privileges';end if;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and rolcanlogin) then raise exception 'API roles must be NOLOGIN';end if;
 foreach r in array array['anon','authenticated'] loop
  foreach obj in array array['vault','pgmq','cron'] loop
   if has_schema_privilege(r,obj,'usage') then raise exception 'browser schema usage: % %',r,obj;end if;
  end loop;
  foreach obj in array array['public.webhook_subscriptions','public.webhook_deliveries','public.webhook_delivery_attempts','public.webhook_manual_replays','pgmq.q_webhook_delivery','pgmq.a_webhook_delivery'] loop
   if has_table_privilege(r,obj,'select,insert,update,delete') then raise exception 'browser table access: % %',r,obj;end if;
  end loop;
  foreach obj in array array['public.claim_webhook_batch(integer)','public.webhook_delivery_secret(uuid,uuid)','public.complete_webhook_delivery(uuid,uuid,text,integer,integer)','public.provision_webhook_subscription(uuid,uuid,uuid,text,text)','public.configure_webhook_scheduler(text,text)','public.webhook_connection_allowed(uuid)','public.webhook_admin(uuid)'] loop
   if has_function_privilege(r,obj,'execute') then raise exception 'browser privileged helper: % %',r,obj;end if;
  end loop;
  -- Real statements, not only metadata assertions. Restore the administrative test session each time.
  execute format('set local role %I',r);
  begin perform 1 from vault.decrypted_secrets;raise exception 'browser read decrypted Vault';exception when insufficient_privilege then null;end;
  begin perform vault.create_secret(repeat('must-not-create-',3));raise exception 'browser created Vault secret';exception when insufficient_privilege then null;end;
  begin perform 1 from pgmq.q_webhook_delivery;raise exception 'browser selected queue';exception when insufficient_privilege then null;end;
  begin perform pgmq.read('webhook_delivery',1,1);raise exception 'browser drained queue';exception when insufficient_privilege then null;end;
  begin perform cron.schedule('must-not-schedule','* * * * *','select 1');raise exception 'browser scheduled work';exception when insufficient_privilege then null;end;
  begin perform public.claim_webhook_batch();raise exception 'browser invoked worker';exception when insufficient_privilege then null;end;
  execute 'reset role';
 end loop;
end$$;
select 'PASS restricted migration role, vendor-owned crypto, application Vault/queue/Cron/worker isolation; vendor net remains outside Data API';
