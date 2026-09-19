import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, ShieldCheck, Settings, LogOut } from 'lucide-react';
import { PORTAL_HOME, PORTAL_LABEL, PortalRole, setActivePortal } from '@/lib/portal';

const ICONS: Record<PortalRole, typeof GraduationCap> = {
  teacher: GraduationCap,
  validator: ShieldCheck,
  admin: Settings,
};

const DESCRIPTIONS: Record<PortalRole, string> = {
  teacher: 'Create Tables of Specification, generate test questionnaires and manage your question bank.',
  validator: 'Review generated questionnaires and submit your Expert Validation.',
  admin: 'Manage accounts, roles, system settings and view evaluation records.',
};

export default function PortalSelect() {
  const navigate = useNavigate();
  const { roles, userId, loading } = useUserRole();
  const { user, signOut } = useAuth();

  const available = (['teacher', 'validator', 'admin'] as PortalRole[]).filter((r) =>
    roles.includes(r),
  );

  useEffect(() => {
    if (loading) return;
    if (available.length === 0) navigate('/auth', { replace: true });
    else if (available.length === 1) navigate(PORTAL_HOME[available[0]], { replace: true });
  }, [loading, available.length, navigate]);

  const choose = (role: PortalRole) => {
    if (userId) setActivePortal(userId, role);
    navigate(PORTAL_HOME[role], { replace: true });
  };

  if (loading || available.length <= 1) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Choose your portal</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {user?.email}. Your account is authorized for more than one role.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {available.map((r) => {
            const Icon = ICONS[r];
            return (
              <Card key={r} className="hover:border-primary transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{PORTAL_LABEL[r]}</CardTitle>
                      <CardDescription className="text-xs">{DESCRIPTIONS[r]}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={() => choose(r)}>
                    Continue
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
