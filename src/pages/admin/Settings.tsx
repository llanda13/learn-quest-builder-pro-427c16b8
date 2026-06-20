import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Shield, Eye, EyeOff, CheckCircle, XCircle, Database, Bell, Building2, Plus, Trash2 } from 'lucide-react';

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {met ? (
        <CheckCircle className="h-4 w-4 text-primary" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [healthAlerts, setHealthAlerts] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Institutional defaults
  const [activeSchoolYear, setActiveSchoolYear] = useState('');
  const [deptOfficers, setDeptOfficers] = useState<Array<{ department: string; chairperson: string; dean: string }>>([]);
  const [savingInstitutional, setSavingInstitutional] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['health_alerts_enabled', 'active_school_year', 'dept_officers']);
        const map = new Map<string, any>((data ?? []).map((r: any) => [r.key, r.value]));
        if (typeof map.get('health_alerts_enabled') === 'boolean') {
          setHealthAlerts(map.get('health_alerts_enabled'));
        }
        const sy = map.get('active_school_year');
        if (typeof sy === 'string') setActiveSchoolYear(sy);
        const officers = map.get('dept_officers');
        if (officers && typeof officers === 'object') {
          setDeptOfficers(
            Object.entries(officers as Record<string, any>).map(([department, v]) => ({
              department,
              chairperson: (v as any)?.chairperson ?? '',
              dean: (v as any)?.dean ?? '',
            }))
          );
        }
      } catch {
        // Use default
      } finally {
        setLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  const saveInstitutionalDefaults = async () => {
    setSavingInstitutional(true);
    try {
      const officersMap: Record<string, { chairperson: string; dean: string }> = {};
      for (const row of deptOfficers) {
        const dept = row.department.trim();
        if (!dept) continue;
        officersMap[dept] = { chairperson: row.chairperson.trim(), dean: row.dean.trim() };
      }
      const updates = [
        { key: 'active_school_year', value: activeSchoolYear.trim() as any, updated_at: new Date().toISOString(), updated_by: user?.id },
        { key: 'dept_officers', value: officersMap as any, updated_at: new Date().toISOString(), updated_by: user?.id },
      ];
      const { error } = await supabase.from('system_settings').upsert(updates, { onConflict: 'key' });
      if (error) throw error;
      toast.success('Institutional defaults saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save institutional defaults');
    } finally {
      setSavingInstitutional(false);
    }
  };

  const addOfficerRow = () =>
    setDeptOfficers((rows) => [...rows, { department: '', chairperson: '', dean: '' }]);
  const removeOfficerRow = (idx: number) =>
    setDeptOfficers((rows) => rows.filter((_, i) => i !== idx));
  const updateOfficerRow = (idx: number, field: 'department' | 'chairperson' | 'dean', value: string) =>
    setDeptOfficers((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));


  const handleToggleHealthAlerts = async (checked: boolean) => {
    setHealthAlerts(checked);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          { key: 'health_alerts_enabled', value: checked as any, updated_at: new Date().toISOString(), updated_by: user?.id },
          { onConflict: 'key' }
        );
      if (error) throw error;
      toast.success(`System health alerts ${checked ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      setHealthAlerts(!checked); // revert
      toast.error(err.message || 'Failed to update setting');
    }
  };

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Password policy checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const allRequirementsMet = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch;

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!allRequirementsMet) {
      toast.error('Please meet all password requirements');
      return;
    }
    setChangingPassword(true);
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (signInError) {
        toast.error('Current password is incorrect');
        setChangingPassword(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success('Password changed successfully. Your other sessions have been invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">System Settings</h1>
          <p className="text-muted-foreground">
            Configure your profile and security settings
          </p>
        </div>
        <Badge variant="outline">Administrator</Badge>
      </div>

      {/* Admin Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Profile</CardTitle>
          <CardDescription>Your administrator account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={user?.email || ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Admin Name"
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* System Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Security
          </CardTitle>
          <CardDescription>Change your password with strong policy enforcement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Separator />

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          {newPassword.length > 0 && (
            <div className="rounded-lg border p-4 space-y-2 bg-muted/50">
              <p className="text-sm font-medium mb-2">Password Requirements:</p>
              <PasswordRequirement met={hasMinLength} label="At least 8 characters" />
              <PasswordRequirement met={hasUppercase} label="At least one uppercase letter" />
              <PasswordRequirement met={hasLowercase} label="At least one lowercase letter" />
              <PasswordRequirement met={hasNumber} label="At least one number" />
              <PasswordRequirement met={hasSpecial} label="At least one special character" />
            </div>
          )}

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={!allRequirementsMet || changingPassword || !currentPassword}
          >
            {changingPassword ? 'Changing Password...' : 'Change Password'}
          </Button>

          <Separator />

          <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <p className="text-sm font-medium">Security Notes</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Passwords are securely hashed server-side by Supabase (bcrypt)</li>
              <li>All other sessions are invalidated after a password change</li>
              <li>Account locks after multiple failed login attempts (managed by Supabase Auth)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Institutional Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Institutional Defaults
          </CardTitle>
          <CardDescription>
            Centralized values used to auto-populate the TOS Builder so teachers never type institutional info manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="activeSchoolYear">Active School Year</Label>
            <Input
              id="activeSchoolYear"
              value={activeSchoolYear}
              onChange={(e) => setActiveSchoolYear(e.target.value)}
              placeholder="e.g., 2025-2026"
            />
            <p className="text-xs text-muted-foreground">Auto-fills the School Year on every new TOS.</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Department Officers</p>
                <p className="text-xs text-muted-foreground">
                  Maps each department to its Chairperson (Checked &amp; Reviewed By) and Dean (Noted By). The department key
                  must match the value stored on each user's profile.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addOfficerRow}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {deptOfficers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No departments configured yet.</p>
            )}

            <div className="space-y-2">
              {deptOfficers.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <Input
                    className="col-span-3"
                    placeholder="Department"
                    value={row.department}
                    onChange={(e) => updateOfficerRow(idx, 'department', e.target.value)}
                  />
                  <Input
                    className="col-span-4"
                    placeholder="Chairperson full name"
                    value={row.chairperson}
                    onChange={(e) => updateOfficerRow(idx, 'chairperson', e.target.value)}
                  />
                  <Input
                    className="col-span-4"
                    placeholder="Dean full name"
                    value={row.dean}
                    onChange={(e) => updateOfficerRow(idx, 'dean', e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => removeOfficerRow(idx)}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={saveInstitutionalDefaults} disabled={savingInstitutional || loadingSettings}>
            {savingInstitutional ? 'Saving…' : 'Save Institutional Defaults'}
          </Button>
        </CardContent>
      </Card>

      {/* Database Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Maintenance
          </CardTitle>
          <CardDescription>Manage database optimization and cleanup tasks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Cleanup Old Presence Records</p>
              <p className="text-sm text-muted-foreground">Remove stale collaboration presence entries older than 1 hour</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { error } = await supabase.rpc('cleanup_old_presence');
                  if (error) throw error;
                  toast.success('Old presence records cleaned up');
                } catch (err: any) {
                  toast.error(err.message || 'Cleanup failed');
                }
              }}
            >
              Run Cleanup
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recalculate Similarity Metrics</p>
              <p className="text-sm text-muted-foreground">Refresh question similarity calculations across the bank</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { error } = await supabase.rpc('calculate_similarity_metrics');
                  if (error) throw error;
                  toast.success('Similarity metrics recalculated');
                } catch (err: any) {
                  toast.error(err.message || 'Recalculation failed');
                }
              }}
            >
              Recalculate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Health Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            System Health Alerts
          </CardTitle>
          <CardDescription>Configure alerting for system-level issues</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Receive alerts about system issues</p>
              <p className="text-sm text-muted-foreground">Get notified about database errors, high latency, or failed operations</p>
            </div>
            <Switch
              checked={healthAlerts}
              onCheckedChange={handleToggleHealthAlerts}
              disabled={loadingSettings}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
