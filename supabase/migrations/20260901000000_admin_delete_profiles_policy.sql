-- Enforce admin-only profile deletion and clean up the permissive self-delete policy.
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Keep role-management aligned with the admin-only delete flow.
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
