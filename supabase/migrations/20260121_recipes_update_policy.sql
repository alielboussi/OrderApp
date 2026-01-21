-- Allow updates to recipes for admin and transfer manager roles

create policy recipes_update_admin_or_transfer_mgr
on public.recipes
for update
to authenticated
using (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'
  )
)
with check (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND lower(COALESCE(r.normalized_slug, r.slug)) = 'transfer_manager'
  )
);
