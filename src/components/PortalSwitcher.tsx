import { useNavigate } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { clearActivePortal, PORTAL_ROLES, PortalRole } from '@/lib/portal';
import { cn } from '@/lib/utils';

interface Props {
  collapsed?: boolean;
  className?: string;
}

/**
 * Shown only when the authenticated account is assigned more than one role.
 * Switching portals never changes permissions — routes stay guarded by the
 * roles assigned in `user_roles`.
 */
export function PortalSwitcher({ collapsed = false, className }: Props) {
  const navigate = useNavigate();
  const { roles, userId } = useUserRole();

  const available = PORTAL_ROLES.filter((r) => roles.includes(r as PortalRole));
  if (available.length < 2) return null;

  return (
    <button
      onClick={() => {
        clearActivePortal(userId);
        navigate('/portal');
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 w-full text-foreground/70 hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <Repeat className="w-5 h-5 shrink-0" />
      {!collapsed && <div className="font-medium">Switch Portal</div>}
    </button>
  );
}
