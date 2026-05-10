import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'teacher' | 'validator' | 'student';

export interface UserRoleData {
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isValidator: boolean;
  hasRole: (role: UserRole) => boolean;
  refetch: () => Promise<void>;
}

export function useUserRole(): UserRoleData {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setRole(null);
        return;
      }

      // Fetch user's roles from user_roles table
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .order('role', { ascending: true }); // Admin will come first due to enum ordering

      if (error) {
        console.error('Error fetching user role:', error);
        setRole(null);
        return;
      }

      // User can have multiple roles, take the highest priority
      if (userRoles && userRoles.length > 0) {
        const roleOrder: UserRole[] = ['admin', 'validator', 'teacher', 'student'];
        const highestRole = roleOrder.find(r => 
          userRoles.some(ur => ur.role === r)
        ) || 'teacher';
        setRole(highestRole);
      } else {
        setRole('teacher'); // Default role
      }
    } catch (error) {
      console.error('Error in useUserRole:', error);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserRole();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const hasRole = (checkRole: UserRole): boolean => {
    if (!role) return false;
    
    // Admin has all permissions
    if (role === 'admin') return true;
    
    // Validator has teacher permissions
    if (role === 'validator' && (checkRole === 'teacher' || checkRole === 'validator')) {
      return true;
    }
    
    // Otherwise, exact match required
    return role === checkRole;
  };

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    isTeacher: role === 'teacher' || role === 'admin' || role === 'validator',
    isValidator: role === 'validator' || role === 'admin',
    hasRole,
    refetch: fetchUserRole,
  };
}