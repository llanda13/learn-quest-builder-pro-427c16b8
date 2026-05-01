import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Save, X, Filter, FileText, BarChart3 } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Questions, type Question } from "@/services/db/questions";
import { QuestionBankReports } from "@/components/admin/QuestionBankReports";
import { FilterManagement } from "@/components/admin/FilterManagement";
import { useUserRole } from "@/hooks/useUserRole";
import { useAcademicHierarchy } from "@/hooks/useAcademicHierarchy";
import { Settings2 } from "lucide-react";
import { normalizeCategory, normalizeSpecialization } from "@/utils/acronymNormalizer";

const ALL_BLOOM_LEVELS = ["Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", "Creating"];

const DIFFICULTY_COGNITIVE_MAP: Record<string, string[]> = {
  Easy: ["Remembering", "Understanding"],
  Average: ["Applying", "Analyzing"],
  Difficult: ["Evaluating", "Creating"],
};

// These helper functions are no longer needed - replaced by useAcademicHierarchy hook

export default function QuestionBankManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<"questions" | "reports" | "manage-filters">("questions");
  const hierarchy = useAcademicHierarchy();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();

  // Cascading filters
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSpecialization, setFilterSpecialization] = useState<string>("all");
  const [filterSubjectCode, setFilterSubjectCode] = useState<string>("all");
  const [filterSubjectDescription, setFilterSubjectDescription] = useState<string>("");

  // Form state
  const [formData, setFormData] = useState({
    question_text: "",
    question_type: "mcq" as string,
    choices: [] as any[],
    correct_answer: "",
    topic: "",
    bloom_level: "",
    difficulty: "",
    subject: "",
    grade_level: "",
    cognitive_level: "",
    knowledge_dimension: "",
    category: "",
    specialization: "",
    subject_code: "",
    subject_description: "",
  });
  const [formCustomCategory, setFormCustomCategory] = useState("");
  const [formCustomSpecialization, setFormCustomSpecialization] = useState("");
  const [formDifficultyDomain, setFormDifficultyDomain] = useState<string[]>([]);

  const { data: questions, isLoading } = useQuery({
    queryKey: ["admin-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Question[];
    },
  });

  // --- Filter dropdown options (DB-driven) ---
  const specializationOptions = useMemo(() => {
    if (filterCategory === "all") return hierarchy.allSpecializations.map(s => s.name);
    const cat = hierarchy.categories.find(c => c.name === filterCategory);
    if (!cat) return [];
    return hierarchy.getSpecializations(cat.id).map(s => s.name);
  }, [filterCategory, hierarchy.categories, hierarchy.allSpecializations]);

  const subjectCodeOptions = useMemo(() => {
    if (filterSpecialization === "all") {
      return hierarchy.allSubjects.map(s => ({ code: s.code, description: s.description }));
    }
    const spec = hierarchy.allSpecializations.find(s => s.name === filterSpecialization);
    if (!spec) return [];
    return hierarchy.getSubjects(spec.id).map(s => ({ code: s.code, description: s.description }));
  }, [filterSpecialization, hierarchy.allSpecializations, hierarchy.allSubjects]);

  const computedSubjectDescription = useMemo(() => {
    if (filterSubjectCode === "all") return "";
    const match = subjectCodeOptions.find(s => s.code === filterSubjectCode);
    return match?.description || "";
  }, [filterSubjectCode, subjectCodeOptions]);

  // Cascading reset handlers
  const handleCategoryChange = (value: string) => {
    setFilterCategory(value);
    setFilterSpecialization("all");
    setFilterSubjectCode("all");
    setFilterSubjectDescription("");
  };

  const handleSpecializationChange = (value: string) => {
    setFilterSpecialization(value);
    setFilterSubjectCode("all");
    setFilterSubjectDescription("");
  };

  const handleSubjectCodeChange = (value: string) => {
    setFilterSubjectCode(value);
  };

  // --- Filtered questions ---
  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    let result = [...questions];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.question_text.toLowerCase().includes(q) ||
          item.topic?.toLowerCase().includes(q) ||
          item.subject?.toLowerCase().includes(q) ||
          (item.tags && item.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    if (filterCategory !== "all") {
      const normFilter = normalizeCategory(filterCategory) || filterCategory;
      result = result.filter((q) => {
        const qCat = normalizeCategory((q as any).category) || (q as any).category;
        return qCat === normFilter;
      });
    }
    if (filterSpecialization !== "all") {
      const normFilter = normalizeSpecialization(filterSpecialization) || filterSpecialization;
      result = result.filter((q) => {
        const qSpec = normalizeSpecialization((q as any).specialization) || (q as any).specialization;
        return qSpec === normFilter;
      });
    }
    if (filterSubjectCode !== "all") {
      result = result.filter((q) => (q as any).subject_code === filterSubjectCode);
    }

    return result;
  }, [questions, searchQuery, filterCategory, filterSpecialization, filterSubjectCode]);

  // --- Form cognitive level options based on difficulty domain checkboxes ---
  const availableCognitiveLevels = useMemo(() => {
    if (formDifficultyDomain.length === 0) return ALL_BLOOM_LEVELS;
    const levels = new Set<string>();
    formDifficultyDomain.forEach((d) => {
      DIFFICULTY_COGNITIVE_MAP[d]?.forEach((l) => levels.add(l));
    });
    return ALL_BLOOM_LEVELS.filter((l) => levels.has(l));
  }, [formDifficultyDomain]);

  // --- Form specialization options (DB-driven) ---
  const formSpecializationOptions = useMemo(() => {
    if (!formData.category) return [] as string[];
    const cat = hierarchy.categories.find(c => c.name === formData.category);
    if (!cat) return [] as string[];
    return hierarchy.getSpecializations(cat.id).map(s => s.name);
  }, [formData.category, hierarchy.categories, hierarchy.allSpecializations]);

  const formSubjectCodeOptions = useMemo(() => {
    if (!formData.specialization) return [] as { code: string; description: string }[];
    const spec = hierarchy.allSpecializations.find(s => s.name === formData.specialization);
    if (!spec) return [] as { code: string; description: string }[];
    return hierarchy.getSubjects(spec.id).map(s => ({ code: s.code, description: s.description }));
  }, [formData.specialization, hierarchy.allSpecializations, hierarchy.allSubjects]);

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await Questions.create({
        ...data,
        created_by: "admin",
        approved: true,
        status: "approved",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      toast.success("Question created successfully");
      resetForm();
    },
    onError: (err: any) => {
      console.error("Create question error:", err);
      toast.error(`Failed to create question: ${err?.message || "Unknown error"}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      return await Questions.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      toast.success("Question updated");
      setEditingId(null);
      resetForm();
    },
    onError: () => toast.error("Failed to update question"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => Questions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      toast.success("Question deleted");
    },
    onError: () => toast.error("Failed to delete question"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => Questions.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      setSelectedIds(new Set());
      toast.success(`Deleted ${selectedIds.size} questions`);
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const resetForm = () => {
    setFormData({
      question_text: "",
      question_type: "mcq",
      choices: [],
      correct_answer: "",
      topic: "",
      bloom_level: "",
      difficulty: "",
      subject: "",
      grade_level: "",
      cognitive_level: "",
      knowledge_dimension: "",
      category: "",
      specialization: "",
      subject_code: "",
      subject_description: "",
    });
    setFormCustomCategory("");
    setFormCustomSpecialization("");
    setFormDifficultyDomain([]);
    setIsCreating(false);
    setEditingId(null);
  };

  const handleEdit = (question: Question) => {
    setEditingId(question.id);
    setFormData({
      question_text: question.question_text,
      question_type: question.question_type as any,
      choices: (question.choices as any[]) || [],
      correct_answer: question.correct_answer || "",
      topic: question.topic,
      bloom_level: question.bloom_level || "",
      difficulty: question.difficulty || "",
      subject: question.subject || "",
      grade_level: question.grade_level || "",
      cognitive_level: question.cognitive_level || "",
      knowledge_dimension: question.knowledge_dimension || "",
      category: (question as any).category || "",
      specialization: (question as any).specialization || "",
      subject_code: (question as any).subject_code || "",
      subject_description: (question as any).subject_description || "",
    });
    setFormCustomCategory("");
    setFormCustomSpecialization("");
    setFormDifficultyDomain([]);
  };

  const handleSubmit = () => {
    // Apply custom category/specialization if set
    const finalData = { ...formData };
    if (formCustomCategory) finalData.category = formCustomCategory;
    if (formCustomSpecialization) finalData.specialization = formCustomSpecialization;

    // Normalize acronyms/full forms before saving
    finalData.category = normalizeCategory(finalData.category) || finalData.category;
    finalData.specialization = normalizeSpecialization(finalData.specialization) || finalData.specialization;

    // Map difficulty domain checkboxes to the difficulty field (DB expects lowercase)
    if (!finalData.difficulty && formDifficultyDomain.length > 0) {
      // Use the first selected difficulty, lowercased to match DB constraint
      finalData.difficulty = formDifficultyDomain[0].toLowerCase();
    }

    // Sync bloom_level from cognitive_level if not set
    if (!finalData.bloom_level && finalData.cognitive_level) {
      finalData.bloom_level = finalData.cognitive_level;
    }

    // Ensure topic has a value (required NOT NULL in DB)
    if (!finalData.topic) {
      finalData.topic = finalData.subject_description || finalData.subject_code || finalData.category || "General";
    }

    // Ensure choices is proper JSON for the DB
    if (finalData.question_type === "mcq" && typeof finalData.choices === "object" && !Array.isArray(finalData.choices)) {
      // Already an object like {A, B, C, D} - keep as is
    } else if (finalData.question_type === "true_false") {
      finalData.choices = { A: "True", B: "False" } as any;
    } else if (["identification", "essay", "fill_blank"].includes(finalData.question_type)) {
      finalData.choices = null as any;
    }

    if (editingId) updateMutation.mutate({ id: editingId, data: finalData });
    else createMutation.mutate(finalData);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredQuestions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredQuestions.map((q) => q.id)));
  };

  const clearFilters = () => {
    setFilterCategory("all");
    setFilterSpecialization("all");
    setFilterSubjectCode("all");
    setFilterSubjectDescription("");
    setSearchQuery("");
  };

  const activeFilterCount = [filterCategory, filterSpecialization, filterSubjectCode].filter(
    (f) => f !== "all"
  ).length;

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    const month = d.toLocaleString("default", { month: "short" });
    const year = d.getFullYear();
    return { month, year };
  };

  const handleDifficultyDomainToggle = (domain: string) => {
    setFormDifficultyDomain((prev) => {
      const next = prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain];
      // Reset cognitive level if it's no longer valid
      if (next.length > 0) {
        const validLevels = new Set<string>();
        next.forEach((d) => DIFFICULTY_COGNITIVE_MAP[d]?.forEach((l) => validLevels.add(l)));
        if (formData.cognitive_level && !validLevels.has(formData.cognitive_level)) {
          setFormData((prev) => ({ ...prev, cognitive_level: "" }));
        }
      }
      return next;
    });
  };

  const renderQuestionCard = (q: Question) => {
    const qAny = q as any;
    const ts = formatTimestamp(q.created_at);
    return (
      <div
        key={q.id}
        className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
      >
        {isAdmin && (
          <Checkbox
            checked={selectedIds.has(q.id)}
            onCheckedChange={() => toggleSelect(q.id)}
            className="mt-1"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            {q.question_text}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-2 text-xs text-muted-foreground">
            {qAny.category && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                {qAny.category}
              </Badge>
            )}
            {(qAny.category && qAny.specialization) && (
              <span className="text-muted-foreground">|</span>
            )}
            {qAny.specialization && (
              <Badge variant="secondary" className="text-xs">
                {qAny.specialization}
              </Badge>
            )}
            <span className="text-muted-foreground">|</span>
            <Badge variant="outline" className="text-xs">
              {ts.year}
            </Badge>
            <span className="text-muted-foreground">|</span>
            <Badge variant="outline" className="text-xs">
              {ts.month}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {isAdmin && (
            <>
              <Button size="icon" variant="ghost" onClick={() => handleEdit(q)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteMutation.mutate(q.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  // --- Render Form ---
  const renderForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>{editingId ? "Edit Question" : "Create New Question"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Row 1: Category & Specialization */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formCustomCategory ? "__custom__" : formData.category || undefined}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setFormCustomCategory(" ");
                  setFormData({ ...formData, category: "", specialization: "", subject_code: "", subject_description: "" });
                } else {
                  setFormCustomCategory("");
                  setFormData({ ...formData, category: v, specialization: "", subject_code: "", subject_description: "" });
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {hierarchy.categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__custom__">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
            {formCustomCategory !== "" && (
              <Input
                placeholder="Enter custom category"
                value={formCustomCategory.trim()}
                onChange={(e) => setFormCustomCategory(e.target.value)}
                className="mt-1"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Specialization</Label>
            <Select
              value={formCustomSpecialization ? "__custom__" : formData.specialization || undefined}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setFormCustomSpecialization(" ");
                  setFormData({ ...formData, specialization: "", subject_code: "", subject_description: "" });
                } else {
                  setFormCustomSpecialization("");
                  setFormData({ ...formData, specialization: v, subject_code: "", subject_description: "" });
                }
              }}
              disabled={!formData.category && !formCustomCategory}
            >
              <SelectTrigger><SelectValue placeholder="Select specialization" /></SelectTrigger>
              <SelectContent>
                {formSpecializationOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                <SelectItem value="__custom__">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
            {formCustomSpecialization !== "" && (
              <Input
                placeholder="Enter custom specialization"
                value={formCustomSpecialization.trim()}
                onChange={(e) => setFormCustomSpecialization(e.target.value)}
                className="mt-1"
              />
            )}
          </div>
        </div>

        {/* Row 2: Subject Code & Subject Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Subject Code</Label>
            {formSubjectCodeOptions.length > 0 && !formCustomSpecialization ? (
              <Select
                value={formData.subject_code || undefined}
                onValueChange={(v) => {
                  const match = formSubjectCodeOptions.find(s => s.code === v);
                  setFormData({ ...formData, subject_code: v, subject_description: match?.description || "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select code" /></SelectTrigger>
                <SelectContent>
                  {formSubjectCodeOptions.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Enter subject code"
                value={formData.subject_code}
                onChange={(e) => setFormData({ ...formData, subject_code: e.target.value })}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Subject Description</Label>
            <Input
              placeholder="Subject description"
              value={formData.subject_description}
              onChange={(e) => setFormData({ ...formData, subject_description: e.target.value })}
              className={formData.subject_description && !formCustomSpecialization && formSubjectCodeOptions.length > 0 ? "bg-muted" : ""}
              readOnly={!!formData.subject_description && !formCustomSpecialization && formSubjectCodeOptions.length > 0}
            />
          </div>
        </div>

        {/* Row 3: Question Type */}
        <div className="space-y-2">
          <Label>Question Type</Label>
          <RadioGroup
            value={formData.question_type}
            onValueChange={(v) => {
              const type = v as typeof formData.question_type;
              let choices: any[] = [];
              let correct_answer = "";
              if (type === "mcq") {
                choices = { A: "", B: "", C: "", D: "" } as any;
              } else if (type === "true_false") {
                choices = { A: "True", B: "False" } as any;
              }
              setFormData({ ...formData, question_type: type, choices, correct_answer });
            }}
            className="flex flex-wrap gap-4 pt-1"
          >
            {[
              { value: "mcq", label: "Multiple Choice" },
              { value: "true_false", label: "True/False" },
              { value: "identification", label: "Identification" },
              { value: "essay", label: "Essay" },
              { value: "fill_blank", label: "Fill in the Blank" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value={opt.value} />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Row 4: Question Text */}
        <div className="space-y-2">
          <Label>Question Text</Label>
          <Textarea
            value={formData.question_text}
            onChange={(e) => setFormData({ ...formData, question_text: e.target.value })}
            rows={formData.question_type === "essay" ? 8 : 5}
            placeholder={
              formData.question_type === "essay"
                ? "Enter essay prompt or question..."
                : formData.question_type === "fill_blank"
                ? "Enter question with ___ for the blank..."
                : "Enter question text..."
            }
            className={formData.question_type === "essay" ? "min-h-[180px]" : "min-h-[120px]"}
          />
        </div>

        {/* Topic field */}
        <div className="space-y-2">
          <Label>Topic</Label>
          <Input
            placeholder="Enter topic (e.g., Data Structures, Programming Basics)"
            value={formData.topic}
            onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
          />
        </div>

        {/* Conditional: MCQ choices & correct answer */}
        {formData.question_type === "mcq" && (
          <div className="space-y-3">
            <Label>Answer Choices</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {["A", "B", "C", "D"].map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm font-semibold w-6">{key}.</span>
                  <Input
                    placeholder={`Option ${key}`}
                    value={(formData.choices as any)?.[key] || ""}
                    onChange={(e) => {
                      const updated = { ...(formData.choices as any || {}), [key]: e.target.value };
                      setFormData({ ...formData, choices: updated });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Correct Answer</Label>
              <Select
                value={formData.correct_answer || undefined}
                onValueChange={(v) => setFormData({ ...formData, correct_answer: v })}
              >
                <SelectTrigger className="w-40"><SelectValue placeholder="Select answer" /></SelectTrigger>
                <SelectContent>
                  {["A", "B", "C", "D"].map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Conditional: True/False correct answer */}
        {formData.question_type === "true_false" && (
          <div className="space-y-2">
            <Label>Correct Answer</Label>
            <RadioGroup
              value={formData.correct_answer}
              onValueChange={(v) => setFormData({ ...formData, correct_answer: v })}
              className="flex gap-6 pt-1"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="True" />
                <span className="text-sm">True</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="False" />
                <span className="text-sm">False</span>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* Conditional: Identification / Fill in the Blank correct answer */}
        {(formData.question_type === "identification" || formData.question_type === "fill_blank") && (
          <div className="space-y-2">
            <Label>Correct Answer</Label>
            <Input
              placeholder={formData.question_type === "fill_blank" ? "Enter the word/phrase for the blank" : "Enter the correct answer"}
              value={formData.correct_answer}
              onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
            />
          </div>
        )}

        {/* Row 4: Cognitive Domain (difficulty checkboxes) + Cognitive Level */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cognitive Domain (Difficulty)</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              {["Easy", "Average", "Difficult"].map((domain) => (
                <label key={domain} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formDifficultyDomain.includes(domain)}
                    onCheckedChange={() => handleDifficultyDomainToggle(domain)}
                  />
                  <span className="text-sm">{domain}</span>
                </label>
              ))}
            </div>
            {formDifficultyDomain.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Mapped levels: {formDifficultyDomain.flatMap((d) => DIFFICULTY_COGNITIVE_MAP[d] || []).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Cognitive Level</Label>
            <Select
              value={formData.cognitive_level || undefined}
              onValueChange={(v) => setFormData({ ...formData, cognitive_level: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select cognitive level" /></SelectTrigger>
              <SelectContent>
                {availableCognitiveLevels.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit}>
            <Save className="h-4 w-4 mr-2" />
            {editingId ? "Update" : "Create"}
          </Button>
          <Button onClick={resetForm} variant="outline">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Question Bank{isAdmin ? " Manager" : ""}</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Full CRUD access to master question repository" : "Browse and add questions to the repository"}
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} size="lg">
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || (editingId && isAdmin)) && renderForm()}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left Filter Panel */}
        <div className="w-full lg:w-64 shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Category */}
              <div className="space-y-2">
                <Label className="text-xs">Category</Label>
                <Select value={filterCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {hierarchy.categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Specialization */}
              <div className="space-y-2">
                <Label className="text-xs">Specialization</Label>
                <Select
                  value={filterSpecialization}
                  onValueChange={handleSpecializationChange}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specializations</SelectItem>
                    {specializationOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject Code */}
              <div className="space-y-2">
                <Label className="text-xs">Subject Code</Label>
                <Select
                  value={filterSubjectCode}
                  onValueChange={handleSubjectCodeChange}
                  disabled={subjectCodeOptions.length === 0}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Codes</SelectItem>
                    {subjectCodeOptions.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.code} — {s.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subject Description - auto-populated */}
              {computedSubjectDescription && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Subject Description</Label>
                  <p className="text-xs font-medium p-2 rounded bg-muted border">
                    {computedSubjectDescription}
                  </p>
                </div>
              )}

              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-3">
          {/* Search + View Toggle Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search questions, topics, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={activeView === "questions" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveView("questions")}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Questions
              </Button>
              <Button
                variant={activeView === "reports" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveView("reports")}
                className="gap-1.5"
              >
                <BarChart3 className="h-4 w-4" />
                Reports
              </Button>
              {isAdmin && (
                <Button
                  variant={activeView === "manage-filters" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView("manage-filters")}
                  className="gap-1.5"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage Filters
                </Button>
              )}
            </div>
          </div>

          {activeView === "manage-filters" ? (
            <FilterManagement />
          ) : activeView === "reports" ? (
            <QuestionBankReports questions={filteredQuestions} />
          ) : (
            <>
              {/* Bulk Actions - Admin only */}
              {isAdmin && selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Separator orientation="vertical" className="h-5" />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Results count + select all */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Checkbox
                      checked={filteredQuestions.length > 0 && selectedIds.size === filteredQuestions.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  )}
                  <span>{filteredQuestions.length} questions</span>
                </div>
              </div>

              {/* Questions Display */}
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading questions...</div>
              ) : filteredQuestions.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground">
                    No questions found.{" "}
                    {activeFilterCount > 0 ? "Try adjusting your filters." : "Create your first question!"}
                  </CardContent>
                </Card>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)]">
                  <div className="space-y-2 pr-4">{filteredQuestions.map(renderQuestionCard)}</div>
                </ScrollArea>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
