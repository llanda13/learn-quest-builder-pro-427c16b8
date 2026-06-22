import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Building2, Plus, Trash2, Pencil, Save, X } from 'lucide-react';

type OfficerRow = {
  department: string;
  chairperson: string;
  dean: string;
  status: 'active' | 'inactive';
};

const SETTING_KEY = 'dept_officers';

export default function DepartmentOfficers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OfficerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<OfficerRow | null>(null);

  // New department form
  const [newDept, setNewDept] = useState('');
  const [newChair, setNewChair] = useState('');
  const [newDean, setNewDean] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', SETTING_KEY)
          .maybeSingle();
        const obj = (data?.value ?? {}) as Record<string, any>;
        const list: OfficerRow[] = Object.entries(obj).map(([department, v]) => ({
          department,
          chairperson: (v as any)?.chairperson ?? '',
          dean: (v as any)?.dean ?? '',
          status: ((v as any)?.status === 'inactive' ? 'inactive' : 'active'),
        }));
        list.sort((a, b) => a.department.localeCompare(b.department));
        setRows(list);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load department officers');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (next: OfficerRow[]) => {
    setSaving(true);
    try {
      const map: Record<string, { chairperson: string; dean: string; status: 'active' | 'inactive' }> = {};
      for (const r of next) {
        const dept = r.department.trim();
        if (!dept) continue;
        map[dept] = {
          chairperson: r.chairperson.trim(),
          dean: r.dean.trim(),
          status: r.status,
        };
      }
      const { error } = await supabase.from('system_settings').upsert(
        [{ key: SETTING_KEY, value: map as any, updated_at: new Date().toISOString(), updated_by: user?.id }],
        { onConflict: 'key' },
      );
      if (error) throw error;
      setRows(next);
      toast.success('Department officers updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addDepartment = async () => {
    const dept = newDept.trim();
    if (!dept) {
      toast.error('Department name is required');
      return;
    }
    if (rows.some((r) => r.department.toLowerCase() === dept.toLowerCase())) {
      toast.error('Department already exists');
      return;
    }
    const next = [
      ...rows,
      { department: dept, chairperson: newChair.trim(), dean: newDean.trim(), status: 'active' as const },
    ].sort((a, b) => a.department.localeCompare(b.department));
    await persist(next);
    setNewDept('');
    setNewChair('');
    setNewDean('');
  };

  const beginEdit = (idx: number) => {
    setEditingIdx(idx);
    setDraft({ ...rows[idx] });
  };
  const cancelEdit = () => {
    setEditingIdx(null);
    setDraft(null);
  };
  const saveEdit = async () => {
    if (editingIdx === null || !draft) return;
    if (!draft.department.trim()) {
      toast.error('Department name is required');
      return;
    }
    const next = rows.map((r, i) => (i === editingIdx ? { ...draft, department: draft.department.trim() } : r));
    await persist(next);
    cancelEdit();
  };

  const toggleStatus = async (idx: number, active: boolean) => {
    const next = rows.map((r, i) =>
      i === idx ? { ...r, status: active ? ('active' as const) : ('inactive' as const) } : r,
    );
    await persist(next);
  };

  const removeRow = async (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    await persist(next);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Building2 className="w-7 h-7 text-primary" />
          Department Officers
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage departments and their Chairperson/Dean. Active officers auto-populate the TOS Builder's
          <em> Checked &amp; Reviewed By </em> and <em> Noted By </em> fields based on the teacher's assigned department.
        </p>
      </div>

      {/* Add new department */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="w-5 h-5" /> Add Department
          </CardTitle>
          <CardDescription>
            Department name must match the value stored in the teacher's profile <code>college</code> field
            (e.g. <code>BSIT</code>, <code>BSIS</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-1">
            <Label>Department</Label>
            <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="e.g., BSIT" />
          </div>
          <div className="md:col-span-1">
            <Label>Chairperson</Label>
            <Input value={newChair} onChange={(e) => setNewChair(e.target.value)} placeholder="Full name" />
          </div>
          <div className="md:col-span-1">
            <Label>Dean</Label>
            <Input value={newDean} onChange={(e) => setNewDean(e.target.value)} placeholder="Full name" />
          </div>
          <Button onClick={addDepartment} disabled={saving}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Departments ({rows.length})</CardTitle>
          <CardDescription>Edit officers, toggle Active/Inactive, or remove a department.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departments yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, idx) => {
                const isEditing = editingIdx === idx;
                const d = isEditing && draft ? draft : row;
                return (
                  <div key={row.department + idx} className="border rounded-lg p-4 bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-3">
                        <Label className="text-xs text-muted-foreground">Department</Label>
                        {isEditing ? (
                          <Input
                            value={d.department}
                            onChange={(e) => setDraft({ ...d, department: e.target.value })}
                          />
                        ) : (
                          <div className="font-semibold">{row.department}</div>
                        )}
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs text-muted-foreground">Chairperson</Label>
                        {isEditing ? (
                          <Input
                            value={d.chairperson}
                            onChange={(e) => setDraft({ ...d, chairperson: e.target.value })}
                          />
                        ) : (
                          <div className="text-sm">{row.chairperson || <span className="text-muted-foreground">—</span>}</div>
                        )}
                      </div>
                      <div className="md:col-span-3">
                        <Label className="text-xs text-muted-foreground">Dean</Label>
                        {isEditing ? (
                          <Input value={d.dean} onChange={(e) => setDraft({ ...d, dean: e.target.value })} />
                        ) : (
                          <div className="text-sm">{row.dean || <span className="text-muted-foreground">—</span>}</div>
                        )}
                      </div>
                      <div className="md:col-span-1 flex flex-col items-start gap-1">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        {isEditing ? (
                          <Switch
                            checked={d.status === 'active'}
                            onCheckedChange={(c) => setDraft({ ...d, status: c ? 'active' : 'inactive' })}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={row.status === 'active'}
                              onCheckedChange={(c) => toggleStatus(idx, c)}
                              disabled={saving}
                            />
                            <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                              {row.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="md:col-span-2 flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={saveEdit} disabled={saving}>
                              <Save className="w-4 h-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => beginEdit(idx)}>
                              <Pencil className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove {row.department}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will delete the department and its officer assignments. Teachers in this
                                    department will no longer get auto-filled Chairperson/Dean values until you
                                    re-add it.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeRow(idx)}>Remove</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            Officers marked <strong>Inactive</strong> will not be auto-populated in new TOS forms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
