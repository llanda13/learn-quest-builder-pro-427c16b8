import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Save, X, FolderTree, BookOpen, GraduationCap } from "lucide-react";
import { useAcademicHierarchy } from "@/hooks/useAcademicHierarchy";

type EditMode = null | { type: "category"; id?: string; name: string } | { type: "specialization"; id?: string; categoryId: string; name: string } | { type: "subject"; id?: string; specializationId: string; code: string; description: string };

export function FilterManagement() {
  const hierarchy = useAcademicHierarchy();
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSpecId, setSelectedSpecId] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);

  const specs = selectedCategoryId ? hierarchy.getSpecializations(selectedCategoryId) : [];
  const subjects = selectedSpecId ? hierarchy.getSubjects(selectedSpecId) : [];

  const handleSave = () => {
    if (!editMode) return;
    if (editMode.type === "category") {
      if (editMode.id) {
        hierarchy.updateCategory.mutate({ id: editMode.id, name: editMode.name });
      } else {
        hierarchy.createCategory.mutate(editMode.name);
      }
    } else if (editMode.type === "specialization") {
      if (editMode.id) {
        hierarchy.updateSpecialization.mutate({ id: editMode.id, name: editMode.name });
      } else {
        hierarchy.createSpecialization.mutate({ categoryId: editMode.categoryId, name: editMode.name });
      }
    } else if (editMode.type === "subject") {
      if (editMode.id) {
        hierarchy.updateSubject.mutate({ id: editMode.id, updates: { code: editMode.code, description: editMode.description } });
      } else {
        hierarchy.createSubject.mutate({ specializationId: editMode.specializationId, code: editMode.code, description: editMode.description });
      }
    }
    setEditMode(null);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "category") hierarchy.deleteCategory.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "specialization") hierarchy.deleteSpecialization.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "subject") hierarchy.deleteSubject.mutate(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-4">
      {/* Categories */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Categories
              <Badge variant="secondary" className="text-xs">{hierarchy.categories.length}</Badge>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setEditMode({ type: "category", name: "" })}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {editMode?.type === "category" && !editMode.id && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input placeholder="Category name" value={editMode.name} onChange={(e) => setEditMode({ ...editMode, name: e.target.value })} autoFocus />
              </div>
              <Button size="sm" onClick={handleSave} disabled={!editMode.name.trim()}><Save className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3" /></Button>
            </div>
          )}
          {hierarchy.categories.map((cat) => (
            <div key={cat.id} className={`flex items-center justify-between p-2 rounded border text-sm cursor-pointer transition-colors ${selectedCategoryId === cat.id ? "bg-primary/10 border-primary/30" : "hover:bg-accent/50"}`}
              onClick={() => { setSelectedCategoryId(cat.id); setSelectedSpecId(""); }}>
              {editMode?.type === "category" && editMode.id === cat.id ? (
                <div className="flex gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                  <Input value={editMode.name} onChange={(e) => setEditMode({ ...editMode, name: e.target.value })} autoFocus className="h-7 text-xs" />
                  <Button size="sm" variant="ghost" onClick={handleSave}><Save className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <>
                  <span className="font-medium">{cat.name}</span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditMode({ type: "category", id: cat.id, name: cat.name })}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteConfirm({ type: "category", id: cat.id, name: cat.name })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {hierarchy.categories.length === 0 && !hierarchy.isLoadingCategories && (
            <p className="text-xs text-muted-foreground text-center py-2">No categories yet</p>
          )}
        </CardContent>
      </Card>

      {/* Specializations */}
      {selectedCategoryId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Specializations
                <Badge variant="secondary" className="text-xs">{specs.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setEditMode({ type: "specialization", categoryId: selectedCategoryId, name: "" })}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {editMode?.type === "specialization" && !editMode.id && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input placeholder="Specialization name" value={editMode.name} onChange={(e) => setEditMode({ ...editMode, name: e.target.value })} autoFocus />
                </div>
                <Button size="sm" onClick={handleSave} disabled={!editMode.name.trim()}><Save className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3" /></Button>
              </div>
            )}
            {specs.map((spec) => (
              <div key={spec.id} className={`flex items-center justify-between p-2 rounded border text-sm cursor-pointer transition-colors ${selectedSpecId === spec.id ? "bg-primary/10 border-primary/30" : "hover:bg-accent/50"}`}
                onClick={() => setSelectedSpecId(spec.id)}>
                {editMode?.type === "specialization" && editMode.id === spec.id ? (
                  <div className="flex gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                    <Input value={editMode.name} onChange={(e) => setEditMode({ ...editMode, name: e.target.value })} autoFocus className="h-7 text-xs" />
                    <Button size="sm" variant="ghost" onClick={handleSave}><Save className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <>
                    <span>{spec.name}</span>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditMode({ type: "specialization", id: spec.id, categoryId: selectedCategoryId, name: spec.name })}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteConfirm({ type: "specialization", id: spec.id, name: spec.name })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {specs.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No specializations in this category</p>}
          </CardContent>
        </Card>
      )}

      {/* Subjects */}
      {selectedSpecId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Subjects
                <Badge variant="secondary" className="text-xs">{subjects.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setEditMode({ type: "subject", specializationId: selectedSpecId, code: "", description: "" })}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {editMode?.type === "subject" && !editMode.id && (
              <div className="space-y-2 p-2 rounded border bg-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Code" value={editMode.code} onChange={(e) => setEditMode({ ...editMode, code: e.target.value })} autoFocus />
                  <div className="col-span-2">
                    <Input placeholder="Description" value={editMode.description} onChange={(e) => setEditMode({ ...editMode, description: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={!editMode.code.trim() || !editMode.description.trim()}><Save className="h-3 w-3 mr-1" /> Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3 mr-1" /> Cancel</Button>
                </div>
              </div>
            )}
            {subjects.map((subj) => (
              <div key={subj.id} className="flex items-center justify-between p-2 rounded border text-sm hover:bg-accent/50">
                {editMode?.type === "subject" && editMode.id === subj.id ? (
                  <div className="flex gap-2 flex-1">
                    <Input value={editMode.code} onChange={(e) => setEditMode({ ...editMode, code: e.target.value })} className="h-7 text-xs w-20" />
                    <Input value={editMode.description} onChange={(e) => setEditMode({ ...editMode, description: e.target.value })} className="h-7 text-xs flex-1" />
                    <Button size="sm" variant="ghost" onClick={handleSave}><Save className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditMode(null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <Badge variant="outline" className="text-xs mr-2">{subj.code}</Badge>
                      <span>{subj.description}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditMode({ type: "subject", id: subj.id, specializationId: selectedSpecId, code: subj.code, description: subj.description })}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteConfirm({ type: "subject", id: subj.id, name: `${subj.code} - ${subj.description}` })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {subjects.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No subjects in this specialization</p>}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{deleteConfirm?.name}"</strong>?
              {deleteConfirm?.type === "category" && " All specializations, subjects, and related questions under this category will be moved to Recently Deleted."}
              {deleteConfirm?.type === "specialization" && " All subjects and related questions under this specialization will be moved to Recently Deleted."}
              {deleteConfirm?.type === "subject" && " Related questions will be moved to Recently Deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
