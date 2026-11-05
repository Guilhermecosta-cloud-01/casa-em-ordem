-- ---------------------------------------------------------------------------
-- Ajustes depois da etapa 6
--
-- 1. As duas tabelas internas da etapa 6 (app_private.settings e
--    app_private.reminder_log) passam a ter RLS ligado, sem políticas. O
--    esquema app_private não é exposto na API e anon/authenticated já não têm
--    permissão nessas tabelas; o RLS é uma tranca a mais. As funções internas
--    que usam as tabelas pertencem ao dono delas e continuam funcionando.
--
-- 2. Lembretes automáticos: onde a extensão pg_cron existe (Supabase), ela é
--    ativada e app_private.enqueue_reminders() passa a rodar a cada 5 minutos,
--    transformando lembretes da agenda e tarefas do dia em notificações. Onde
--    ela não existe (banco local de testes), este passo é pulado sem erro.
-- ---------------------------------------------------------------------------

alter table app_private.settings enable row level security;
alter table app_private.reminder_log enable row level security;
revoke all on app_private.reminder_log from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
      grant usage on schema cron to postgres;
      grant all privileges on all tables in schema cron to postgres;
      perform cron.schedule(
        'casa-em-ordem-lembretes',
        '*/5 * * * *',
        'select app_private.enqueue_reminders()'
      );
    exception when others then
      raise warning 'Lembretes automáticos não ativados: %', sqlerrm;
    end;
  end if;
end;
$$;
