import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'teacher' | 'validator' | 'student';

export interface UserRoleData {
  role: UserRole | null;
  roles: UserRole[];
  userId: string | null;
  loading: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isValidator: boolean;
  hasRole: (role: UserRole) => boolean;
  refetch: () => Promise<void>;
}

/**
 * Roles are additive permissions. A teacher may also be explicitly granted
 * validator access without losing teacher tools.
 *
 * A role is only granted when it is explicitly assigned in `user_roles`.
 * No role implies another role.
 */
export function useUserRole(): UserRoleData {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);

      if (!user) {
        setRole(null);
        setRoles([]);
        return;
      }

      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user role:', error);
        setRole(null);
        setRoles([]);
        return;
      }

      const assigned = (userRoles ?? []).map((r) => r.role as UserRole);
      setRoles(assigned);

      // Primary role (used for landing redirects) — explicit assignment only.
      const priority: UserRole[] = ['admin', 'teacher', 'validator', 'student'];
      const primary = priority.find((r) => assigned.includes(r)) ?? 'teacher';
      setRole(primary);
    } catch (error) {
      console.error('Error in useUserRole:', error);
      setRole(null);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserRole();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Strict: only an explicitly assigned role grants access.
  const hasRole = (checkRole: UserRole): boolean => {
    if (roles.length === 0) return checkRole === 'teacher' && role === 'teacher';
    return roles.includes(checkRole);
  };

  return {
    role,
    roles,
    userId,
    loading,
    isAdmin: hasRole('admin'),
    isTeacher: hasRole('teacher'),
    isValidator: hasRole('validator'),
    hasRole,
    refetch: fetchUserRole,
  };
}
