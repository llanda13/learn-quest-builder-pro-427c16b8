import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
}

export function homeForRole(role: UserRole | null): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "validator") return "/validator/pending";
  if (role === "teacher") return "/teacher/dashboard";
  return "/auth";
}

const REAUTH_WINDOW_MS = 15 * 60 * 1000;

function hasRecentReauthentication(userId: string | undefined): boolean {
  if (!userId) return false;
  const timestamp = sessionStorage.getItem(`expert-validation-reauth:${userId}`);
  return !!timestamp && Date.now() - Date.parse(timestamp) < REAUTH_WINDOW_MS;
}

export function ProtectedRoute({ children, requiredRole, allowedRoles }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const { role, loading, hasRole } = useUserRole();

  const denied =
    !loading &&
    (!role ||
      (requiredRole && !hasRole(requiredRole)) ||
      (allowedRoles && !allowedRoles.some((r) => hasRole(r))));

  useEffect(() => {
    if (loading) return;

    if (!role) {
      navigate("/auth", { replace: true });
      return;
    }

    if (denied) {
      navigate(homeForRole(role), { replace: true });
    }
  }, [role, loading, denied, navigate]);

  if (loading || denied) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function ReauthenticationGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, isValidator, loading: roleLoading } = useUserRole();
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const reauthKey = user ? `expert-validation-reauth:${user.id}` : "";
  const [verified, setVerified] = useState(() => hasRecentReauthentication(user?.id));
  const [error, setError] = useState("");

  useEffect(() => {
    setVerified(hasRecentReauthentication(user?.id));
  }, [user]);

  if (roleLoading || !user || (!isAdmin && !isValidator)) return null;
  if (verified) return <>{children}</>;

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerifying(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password,
    });
    if (signInError) {
      setError("The password did not match the currently signed-in account.");
    } else {
      sessionStorage.setItem(reauthKey, new Date().toISOString());
      setVerified(true);
      setPassword("");
    }
    setVerifying(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-secondary/10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Verify your identity</CardTitle>
          <CardDescription>Enter the password for {user.email} to open Expert Validation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="validation-password">Current account password</Label>
              <Input id="validation-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={verifying}>{verifying ? "Verifying..." : "Continue to Expert Validation"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
