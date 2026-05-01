import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, RotateCcw, Trash2, FileQuestion, FolderTree, GraduationCap, BookOpen } from 'lucide-react';
import { AcademicHierarchy } from '@/services/db/academicHierarchy';

interface DeletedQuestion {
  id: string;
  question_text: string;
  topic: string;
  bloom_level: string | null;
  question_type: string;
  updated_at: string;
}

type ConfirmAction = {
  type: 'restore' | 'permanentDelete';
  entity: 'question' | 'category' | 'specialization' | 'subject';
  id: string;
  label: string;
} | null;

export default function RecentlyDeleted() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [saving, setSaving] = useState(false);

  const { data: deletedQuestions, isLoading: loadingQuestions } = useQuery({
    queryKey: ['deleted-questions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_text, topic, bloom_level, question_type, updated_at')
        .eq('deleted', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DeletedQuestion[];
    }
  });

  const { data: deletedCategories, isLoading: loadingCategories } = useQuery({
    queryKey: ['deleted-categories'],
    queryFn: () => AcademicHierarchy.getDeletedCategories(),
  });

  const { data: deletedSpecializations, isLoading: loadingSpecs } = useQuery({
    queryKey: ['deleted-specializations'],
    queryFn: () => AcademicHierarchy.getDeletedSpecializations(),
  });

  const { data: deletedSubjects, isLoading: loadingSubjects } = useQuery({
    queryKey: ['deleted-subjects'],
    queryFn: () => AcademicHierarchy.getDeletedSubjects(),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['deleted-questions'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-categories'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-specializations'] });
    queryClient.invalidateQueries({ queryKey: ['deleted-subjects'] });
    queryClient.invalidateQueries({ queryKey: ['academic-categories'] });
    queryClient.invalidateQueries({ queryKey: ['academic-specializations-all'] });
    queryClient.invalidateQueries({ queryKey: ['academic-subjects-all'] });
    queryClient.invalidateQueries({ queryKey: ['admin-questions'] });
  };

  const handleRestore = async () => {
    if (!confirmAction || confirmAction.type !== 'restore') return;
    try {
      setSaving(true);
      switch (confirmAction.entity) {
        case 'question':
          await supabase.from('questions').update({ deleted: false } as any).eq('id', confirmAction.id);
          break;
        case 'category':
          await AcademicHierarchy.restoreCategory(confirmAction.id);
          break;
        case 'specialization':
          await AcademicHierarchy.restoreSpecialization(confirmAction.id);
          break;
        case 'subject':
          await AcademicHierarchy.restoreSubject(confirmAction.id);
          break;
      }
      toast({ title: 'Restored', description: `${confirmAction.entity} has been restored.` });
      invalidateAll();
    } catch (error) {
      console.error('Restore error:', error);
      toast({ title: 'Error', description: 'Failed to restore item.', variant: 'destructive' });
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmAction || confirmAction.type !== 'permanentDelete') return;
    try {
      setSaving(true);
      switch (confirmAction.entity) {
        case 'question':
          await supabase.from('questions').delete().eq('id', confirmAction.id);
          break;
        case 'category':
          await AcademicHierarchy.permanentDeleteCategory(confirmAction.id);
          break;
        case 'specialization':
          await AcademicHierarchy.permanentDeleteSpecialization(confirmAction.id);
          break;
        case 'subject':
          await AcademicHierarchy.permanentDeleteSubject(confirmAction.id);
          break;
      }
      toast({ title: 'Permanently Deleted', description: 'Item has been permanently removed.' });
      invalidateAll();
    } catch (error) {
      console.error('Permanent delete error:', error);
      toast({ title: 'Error', description: 'Failed to permanently delete item.', variant: 'destructive' });
    } finally {
      setSaving(false);
      setConfirmAction(null);
    }
  };

  const ActionButtons = ({ entity, id, label }: { entity: ConfirmAction extends null ? never : NonNullable<ConfirmAction>['entity']; id: string; label: string }) => (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => setConfirmAction({ type: 'restore', entity, id, label })}>
        <RotateCcw className="h-4 w-4 mr-1" /> Restore
      </Button>
      <Button variant="destructive" size="sm" onClick={() => setConfirmAction({ type: 'permanentDelete', entity, id, label })}>
        <Trash2 className="h-4 w-4 mr-1" /> Delete Permanently
      </Button>
    </div>
  );

  const totalDeleted = (deletedQuestions?.length || 0) + (deletedCategories?.length || 0) + (deletedSpecializations?.length || 0) + (deletedSubjects?.length || 0);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Archive className="h-8 w-8" />
          Recently Deleted
        </h1>
        <p className="text-muted-foreground">Recover deleted items or remove them permanently ({totalDeleted} items)</p>
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <FileQuestion className="h-4 w-4" />
            Questions
            {(deletedQuestions?.length || 0) > 0 && <Badge variant="secondary" className="text-xs">{deletedQuestions?.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Categories
            {(deletedCategories?.length || 0) > 0 && <Badge variant="secondary" className="text-xs">{deletedCategories?.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="specializations" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Specializations
            {(deletedSpecializations?.length || 0) > 0 && <Badge variant="secondary" className="text-xs">{deletedSpecializations?.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="subjects" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Subjects
            {(deletedSubjects?.length || 0) > 0 && <Badge variant="secondary" className="text-xs">{deletedSubjects?.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Questions */}
        <TabsContent value="questions">
          <Card>
            <CardHeader><CardTitle>Deleted Questions</CardTitle></CardHeader>
            <CardContent>
              {loadingQuestions ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : deletedQuestions && deletedQuestions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Bloom's Level</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedQuestions.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="max-w-[300px] truncate">{q.question_text}</TableCell>
                        <TableCell>{q.topic}</TableCell>
                        <TableCell><Badge variant="secondary">{q.question_type}</Badge></TableCell>
                        <TableCell>{q.bloom_level || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(q.updated_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <ActionButtons entity="question" id={q.id} label={q.question_text.slice(0, 40)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No deleted questions found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories">
          <Card>
            <CardHeader><CardTitle>Deleted Categories</CardTitle></CardHeader>
            <CardContent>
              {loadingCategories ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : deletedCategories && deletedCategories.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedCategories.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.deleted_at ? new Date(c.deleted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          <ActionButtons entity="category" id={c.id} label={c.name} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No deleted categories found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Specializations */}
        <TabsContent value="specializations">
          <Card>
            <CardHeader><CardTitle>Deleted Specializations</CardTitle></CardHeader>
            <CardContent>
              {loadingSpecs ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : deletedSpecializations && deletedSpecializations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedSpecializations.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell><Badge variant="outline">{s.category_name || '—'}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.deleted_at ? new Date(s.deleted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          <ActionButtons entity="specialization" id={s.id} label={s.name} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No deleted specializations found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subjects */}
        <TabsContent value="subjects">
          <Card>
            <CardHeader><CardTitle>Deleted Subjects</CardTitle></CardHeader>
            <CardContent>
              {loadingSubjects ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
              ) : deletedSubjects && deletedSubjects.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedSubjects.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell><Badge variant="outline">{s.code}</Badge></TableCell>
                        <TableCell className="font-medium">{s.description}</TableCell>
                        <TableCell>{s.specialization_name || '—'}</TableCell>
                        <TableCell>{s.category_name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.deleted_at ? new Date(s.deleted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right">
                          <ActionButtons entity="subject" id={s.id} label={`${s.code} - ${s.description}`} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No deleted subjects found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'restore' ? 'Restore Item' : 'Delete Permanently'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'restore'
                ? `Are you sure you want to restore "${confirmAction?.label}..."? It will be available in the system again.`
                : `Are you sure you want to permanently delete "${confirmAction?.label}..."? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction?.type === 'restore' ? handleRestore : handlePermanentDelete}
              className={confirmAction?.type === 'permanentDelete' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {saving ? 'Processing...' : confirmAction?.type === 'restore' ? 'Restore' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
