import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Building2, Plus, Trash2, Pencil, Save, X } from 'lucide-react';
import type { DepartmentOfficer } from '@/services/db/departmentOfficers';
import { CollegeCourseSelects } from '@/components/CollegeCourseSelects';

const db = supabase as any;
const norm = (s: string) => s.trim().toLowerCase();

export default function DepartmentOfficers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DepartmentOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DepartmentOfficer | null>(null);

  const [newDept, setNewDept] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [newChair, setNewChair] = useState('');
  const [newDean, setNewDean] = useState('');

  const load = async () => {
    const { data, error } = await db
      .from('department_officers')
      .select('id, department, course, chairperson, dean, status')
      .order('department').order('course');
    if (error) toast.error(error.message);
    setRows((data ?? []) as DepartmentOfficer[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const hasActiveDuplicate = (dept: string, course: string, exceptId?: string) =>
    rows.some((r) => r.id !== exceptId && r.status === 'active' && norm(r.department) === norm(dept) && norm(r.course) === norm(course));

  const friendly = (err: any) =>
    err?.code === '23505' ? 'An active assignment for this Department + Course already exists.' : err?.message || 'Failed to save';

  const addRow = async () => {
    const department = newDept.trim(), course = newCourse.trim();
    if (!department) return toast.error('Department is required');
    if (!course) return toast.error('Course is required');
    if (hasActiveDuplicate(department, course)) return toast.error('An active assignment for this Department + Course already exists.');
    setSaving(true);
    const { error } = await db.from('department_officers').insert({
      department, course, chairperson: newChair.trim(), dean: newDean.trim(), status: 'active', updated_by: user?.id,
    });
    setSaving(false);
    if (error) return toast.error(friendly(error));
    toast.success('Officer assignment added');
    setNewDept(''); setNewCourse(''); setNewChair(''); setNewDean('');
    load();
  };

  const update = async (id: string, patch: Partial<DepartmentOfficer>) => {
    setSaving(true);
    const { error } = await db.from('department_officers').update({ ...patch, updated_by: user?.id }).eq('id', id);
    setSaving(false);
    if (error) { toast.error(friendly(error)); return false; }
    toast.success('Department officers updated');
    load();
    return true;
  };

  const saveEdit = async () => {
    if (!draft) return;
    const department = draft.department.trim(), course = draft.course.trim();
    if (!department || !course) return toast.error('Department and Course are required');
    if (draft.status === 'active' && hasActiveDuplicate(department, course, draft.id))
      return toast.error('An active assignment for this Department + Course already exists.');
    const ok = await update(draft.id, {
      department, course, chairperson: draft.chairperson.trim(), dean: draft.dean.trim(), status: draft.status,
    });
    if (ok) { setEditingId(null); setDraft(null); }
  };

  const toggleStatus = (row: DepartmentOfficer, active: boolean) => {
    if (active && hasActiveDuplicate(row.department, row.course, row.id))
      return toast.error('Another active assignment for this Department + Course already exists.');
    update(row.id, { status: active ? 'active' : 'inactive' });
  };

  const removeRow = async (id: string) => {
    const { error } = await db.from('department_officers').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Assignment removed');
    load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Building2 className="w-7 h-7 text-primary" />
          Department Officers
        </h1>
        <p className="text-muted-foreground mt-1">
          Assign a Chairperson and Dean per Department + Course. Active assignments auto-populate the TOS Builder's
          <em> Checked &amp; Reviewed By </em> and <em> Noted By </em> fields based on the teacher's Department and Course.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Plus className="w-5 h-5" /> Add Department</CardTitle>
          <CardDescription>
            Department and Course must match the teacher's profile <code>College</code> and <code>Course</code> values.
            A department can have several courses, each with its own officers.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <CollegeCourseSelects
            college={newDept}
            course={newCourse}
            onCollegeChange={setNewDept}
            onCourseChange={setNewCourse}
            collegeLabel="Department"
            courseLabel="Course"
            required
            disabled={saving}
          />
          <div><Label>Chairperson</Label><Input value={newChair} onChange={(e) => setNewChair(e.target.value)} placeholder="Full name" /></div>
          <div><Label>Dean</Label><Input value={newDean} onChange={(e) => setNewDean(e.target.value)} placeholder="Full name" /></div>
          <Button onClick={addRow} disabled={saving}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assignments ({rows.length})</CardTitle>
          <CardDescription>Edit officers, toggle Active/Inactive, or remove an individual course assignment.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const isEditing = editingId === row.id && draft;
                const d = isEditing ? draft! : row;
                const field = (key: 'department' | 'course' | 'chairperson' | 'dean', label: string, bold = false) => (
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    {isEditing ? (
                      <Input value={d[key]} onChange={(e) => setDraft({ ...d, [key]: e.target.value })} />
                    ) : (
                      <div className={bold ? 'font-semibold' : 'text-sm'}>{row[key] || <span className="text-muted-foreground">—</span>}</div>
                    )}
                  </div>
                );
                const editSelects = isEditing && (
                  <div className="md:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CollegeCourseSelects
                      college={d.department}
                      course={d.course}
                      onCollegeChange={(v) => setDraft({ ...d, department: v })}
                      onCourseChange={(v) => setDraft({ ...d, course: v })}
                      collegeLabel="Department"
                      courseLabel="Course"
                      disabled={saving}
                    />
                  </div>
                );
                return (
                  <div key={row.id} className="border rounded-lg p-4 bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      {field('department', 'Department', true)}
                      {field('course', 'Course', true)}
                      {field('chairperson', 'Chairperson')}
                      {field('dean', 'Dean')}
                      <div className="md:col-span-2 flex flex-col items-start gap-1">
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        {isEditing ? (
                          <Switch checked={d.status === 'active'} onCheckedChange={(c) => setDraft({ ...d, status: c ? 'active' : 'inactive' })} />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch checked={row.status === 'active'} onCheckedChange={(c) => toggleStatus(row, c)} disabled={saving} />
                            <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>
                              {row.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="md:col-span-2 flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={saveEdit} disabled={saving}><Save className="w-4 h-4 mr-1" /> Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft(null); }}><X className="w-4 h-4" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setEditingId(row.id); setDraft({ ...row }); }}>
                              <Pencil className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive"><Trash2 className="w-4 h-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove {row.department} – {row.course}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Only this course assignment is removed. Other courses in the same department are not affected.
                                    Already-created TOS keep the officers they were saved with.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeRow(row.id)}>Remove</AlertDialogAction>
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
            Assignments marked <strong>Inactive</strong> will not be auto-populated in new TOS forms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
