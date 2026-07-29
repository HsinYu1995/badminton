-- Cancelling a request or leaving an event now fully removes the row
-- (instead of moving it to 'declined'), so the requester can send a fresh
-- request later if they change their mind again - the earlier
-- update-to-declined design made withdrawal permanent, which turned out
-- not to be what's wanted. 'declined' is left in the status check
-- constraint for a possible future organizer-reject flow; this policy only
-- covers a user removing their own row, whatever its current status.
create policy "participants_delete_own" on public.event_participants
  for delete to authenticated using (auth.uid() = user_id);

grant delete on public.event_participants to authenticated;
