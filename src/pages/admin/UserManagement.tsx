import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  college: string | null;
  course: string | null;
  created_at: string;
  role: 'admin' | 'teacher' | 'validator' | null;
  roles: Array<'admin' | 'teacher' | 'validator'>;
}

interface UserFormData {
  email: string;
  full_name: string;
  college: string;
  course: string;
  role: string;
  password: string;
  evaluator: boolean;
}

const emptyForm: UserFormData = { email: '', full_name: '', college: '', course: '', role: 'teacher', password: '', evaluator: false };

export default function UserManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<UserWithRole | null>(null);
  const [editForm, setEditForm] = useState<UserFormData>(emptyForm);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState<UserFormData>(emptyForm);
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesError) throw rolesError;

      const roleMap = new Map<string, Array<'admin' | 'teacher' | 'validator'>>();
      roles?.forEach(r => {
        const assigned = roleMap.get(r.user_id) || [];
        assigned.push(r.role as 'admin' | 'teacher' | 'validator');
        roleMap.set(r.user_id, assigned);
      });

      setUsers((profiles || []).map(p => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name || '',
        college: p.college || null,
        course: (p as any).course || null,
        created_at: p.created_at,
        roles: roleMap.get(p.id) || [],
        role: (['admin', 'teacher', 'validator'] as const).find((candidate) => roleMap.get(p.id)?.includes(candidate)) || null,
      })));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ title: 'Error', description: 'Failed to load users.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (user: UserWithRole) => {
    setEditUser(user);
    setEditForm({
      email: user.email,
      full_name: user.full_name,
      college: user.college || '',
      course: user.course || '',
      role: user.role || 'teacher',
      password: '',
      evaluator: user.roles.includes('validator'),
    });
    setShowEditDialog(true);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    try {
      setSaving(true);
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: editForm.full_name, college: editForm.college, course: editForm.course.trim() || null } as any)
        .eq('id', editUser.id);
      if (profileError) throw profileError;

      // Desired role set: the primary role plus optional evaluator access.
      const desired = new Set<'admin' | 'teacher' | 'validator'>();
      desired.add((editForm.role as 'admin' | 'teacher' | 'validator') || 'teacher');
      if (editForm.evaluator) desired.add('validator');
      else if (editForm.role !== 'validator') desired.delete('validator');

      const { error: clearError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', editUser.id);
      if (clearError) throw clearError;

      const { error: roleError } = await supabase
        .from('user_roles')
        .insert([...desired].map((role) => ({ user_id: editUser.id, role })));
      if (roleError) throw roleError;

      const { data: persistedRoles, error: verifyRoleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', editUser.id);
      if (verifyRoleError) throw verifyRoleError;
      const persisted = new Set((persistedRoles ?? []).map(({ role }) => role));
      const mismatch = [...desired].some((role) => !persisted.has(role)) || persisted.size !== desired.size;
      if (mismatch) {
        throw new Error('Role changes were not saved. Please try again.');
      }


      toast({ title: 'Success', description: 'User updated successfully.' });
      setShowEditDialog(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to update user.', variant: 'destructive' });

    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser?.id) {
      toast({ title: 'Error', description: 'No user selected for deletion.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);

      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', deleteUser.id);
      if (rolesError) throw rolesError;

      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteUser.id);
      if (profileError) throw profileError;

      setUsers((current) => current.filter((user) => user.id !== deleteUser.id));
      toast({ title: 'Deleted successfully.', description: `${deleteUser.email} was removed.` });
      setDeleteUser(null);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Delete failed',
        description: error?.message || 'Failed to delete user. Check the Supabase Auth dashboard and row-level security policies.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTeacher = async () => {
    if (!addForm.email || !addForm.full_name) {
      toast({ title: 'Validation', description: 'Email and Full Name are required.', variant: 'destructive' });
      return;
    }
    if (!addForm.password || addForm.password.length < 6) {
      toast({ title: 'Validation', description: 'Temporary password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);

      // Account creation runs server-side with the service role so the admin's
      // own session is never replaced and the chosen role is guaranteed to be
      // written to user_roles (the call fails loudly and rolls back otherwise).
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: addForm.email,
          full_name: addForm.full_name,
          college: addForm.college,
          course: addForm.course,
          password: addForm.password,
          role: addForm.role,
        },
      });

      const failure = (error as any)?.message || (data as any)?.error;
      if (error || !data?.ok) {
        throw new Error(failure || 'Account creation failed.');
      }

      const assigned: string[] = data.roles ?? [];
      toast({
        title: 'Account created',
        description: `${addForm.email} was created with role: ${assigned.map((r) => (r === 'validator' ? 'Evaluator' : r)).join(', ')}.`,
      });
      setShowAddDialog(false);
      setAddForm(emptyForm);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast({
        title: 'Account not created',
        description: error?.message || 'Failed to create the account. No role was assigned.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Management
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={() => { setAddForm(emptyForm); setShowAddDialog(true); }} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
            <Button variant="outline" onClick={fetchUsers} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found. Users will appear here after they sign up.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>College</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.full_name || '—'}</TableCell>
                    <TableCell>{user.college || '—'}</TableCell>
                    <TableCell>{user.course || <span className="text-destructive text-xs">Not assigned</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(user.roles.length ? user.roles : ['No Role']).map((role) => (
                          <Badge key={role} variant={role === 'admin' ? 'default' : role === 'validator' ? 'outline' : 'secondary'}>
                            {role === 'validator' ? 'Evaluator' : role}
                          </Badge>

                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                          <Pencil className="h-4 w-4 mr-1" /> Update
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteUser(user)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update User</DialogTitle>
            <DialogDescription>Edit the user's details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Email</Label>
              <Input value={editForm.email} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>College</Label>
              <Input value={editForm.college} onChange={e => setEditForm(f => ({ ...f, college: e.target.value }))} placeholder="e.g. College of Engineering" />
            </div>
            <div className="space-y-2">
              <Label>Course</Label>
              <Input value={editForm.course} onChange={e => setEditForm(f => ({ ...f, course: e.target.value }))} placeholder="e.g. BSIT" />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm(f => ({ ...f, role: v, evaluator: v === 'validator' ? true : f.evaluator }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher / User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="validator">Evaluator (Expert Validation)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox id="evaluator-access" checked={editForm.evaluator} onCheckedChange={(checked) => setEditForm(f => ({ ...f, evaluator: checked === true }))} />
              <div className="space-y-1">
                <Label htmlFor="evaluator-access">Evaluator access</Label>
                <p className="text-xs text-muted-foreground">Allow this existing account to enter Expert Validation after password re-authentication.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Teacher Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription>
              Register a teacher, administrator, or an authorized Evaluator (Dean / Chairperson).
              Evaluators sign in with their own credentials to perform Expert Validation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="faculty@school.edu" />
            </div>
            <div>
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Juan Dela Cruz" />
            </div>
            <div>
              <Label>College</Label>
              <Input value={addForm.college} onChange={e => setAddForm(f => ({ ...f, college: e.target.value }))} placeholder="e.g. College of Education" />
            </div>
            <div className="space-y-2">
              <Label>Course</Label>
              <Input value={addForm.course} onChange={e => setAddForm(f => ({ ...f, course: e.target.value }))} placeholder="e.g. BSIT" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher / User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="validator">Evaluator (Expert Validation)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Temporary Password <span className="text-destructive">*</span></Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddTeacher} disabled={saving}>{saving ? 'Adding...' : 'Add User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => { if (!open) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
              <div className="mt-2 font-medium text-foreground">{deleteUser?.email}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {saving ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
