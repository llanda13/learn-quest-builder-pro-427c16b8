import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AcademicHierarchy } from "@/services/db/academicHierarchy";
import { toast } from "sonner";

export function useAcademicHierarchy() {
  const queryClient = useQueryClient();

  const categories = useQuery({
    queryKey: ["academic-categories"],
    queryFn: () => AcademicHierarchy.getCategories(),
  });

  const allSpecializations = useQuery({
    queryKey: ["academic-specializations-all"],
    queryFn: () => AcademicHierarchy.getSpecializations(),
  });

  const getSpecializations = (categoryId?: string) => {
    if (!categoryId) return allSpecializations.data || [];
    return (allSpecializations.data || []).filter((s) => s.category_id === categoryId);
  };

  const allSubjects = useQuery({
    queryKey: ["academic-subjects-all"],
    queryFn: () => AcademicHierarchy.getSubjects(),
  });

  const getSubjects = (specializationId?: string) => {
    if (!specializationId) return allSubjects.data || [];
    return (allSubjects.data || []).filter((s) => s.specialization_id === specializationId);
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["academic-categories"] });
    queryClient.invalidateQueries({ queryKey: ["academic-specializations-all"] });
    queryClient.invalidateQueries({ queryKey: ["academic-subjects-all"] });
  };

  // Mutations
  const createCategory = useMutation({
    mutationFn: (name: string) => AcademicHierarchy.createCategory(name),
    onSuccess: () => { invalidateAll(); toast.success("Category created"); },
    onError: () => toast.error("Failed to create category"),
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => AcademicHierarchy.updateCategory(id, name),
    onSuccess: () => { invalidateAll(); toast.success("Category updated"); },
    onError: () => toast.error("Failed to update category"),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => AcademicHierarchy.softDeleteCategory(id),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["deleted-questions"] });
      toast.success("Category and related items moved to Recently Deleted");
    },
    onError: () => toast.error("Failed to delete category"),
  });

  const createSpecialization = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      AcademicHierarchy.createSpecialization(categoryId, name),
    onSuccess: () => { invalidateAll(); toast.success("Specialization created"); },
    onError: () => toast.error("Failed to create specialization"),
  });

  const updateSpecialization = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      AcademicHierarchy.updateSpecialization(id, name),
    onSuccess: () => { invalidateAll(); toast.success("Specialization updated"); },
    onError: () => toast.error("Failed to update specialization"),
  });

  const deleteSpecialization = useMutation({
    mutationFn: (id: string) => AcademicHierarchy.softDeleteSpecialization(id),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["deleted-questions"] });
      toast.success("Specialization and related items moved to Recently Deleted");
    },
    onError: () => toast.error("Failed to delete specialization"),
  });

  const createSubject = useMutation({
    mutationFn: ({ specializationId, code, description }: { specializationId: string; code: string; description: string }) =>
      AcademicHierarchy.createSubject(specializationId, code, description),
    onSuccess: () => { invalidateAll(); toast.success("Subject created"); },
    onError: () => toast.error("Failed to create subject"),
  });

  const updateSubject = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { code?: string; description?: string } }) =>
      AcademicHierarchy.updateSubject(id, updates),
    onSuccess: () => { invalidateAll(); toast.success("Subject updated"); },
    onError: () => toast.error("Failed to update subject"),
  });

  const deleteSubject = useMutation({
    mutationFn: (id: string) => AcademicHierarchy.softDeleteSubject(id),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["deleted-questions"] });
      toast.success("Subject and related questions moved to Recently Deleted");
    },
    onError: () => toast.error("Failed to delete subject"),
  });

  return {
    categories: categories.data || [],
    isLoadingCategories: categories.isLoading,
    getSpecializations,
    allSpecializations: allSpecializations.data || [],
    isLoadingSpecializations: allSpecializations.isLoading,
    getSubjects,
    allSubjects: allSubjects.data || [],
    isLoadingSubjects: allSubjects.isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    createSpecialization,
    updateSpecialization,
    deleteSpecialization,
    createSubject,
    updateSubject,
    deleteSubject,
    invalidateAll,
  };
}
