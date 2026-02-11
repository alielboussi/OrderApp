-- Remove POS sync pause feature data and policies.

delete from public.counter_values
where counter_key = 'pos_sync_paused';

drop policy if exists counter_values_pos_sync_pause_insert on public.counter_values;
drop policy if exists counter_values_pos_sync_pause_select on public.counter_values;
drop policy if exists counter_values_pos_sync_pause_update on public.counter_values;
