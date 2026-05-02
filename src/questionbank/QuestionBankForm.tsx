import { useState, useEffect } from "react";
import { usePersistentState, clearPersistedState } from "@/hooks/usePersistentState";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const questionSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  text: z.string().min(10, "Question text must be at least 10 characters"),
  type: z.enum(["mcq", "essay", "tf", "fill"]),
  choices: z.array(z.string()).optional(),
  correct_answer: z.string().min(1, "Correct answer is required"),
  bloom_level: z.string().min(1, "Bloom's level is required"),
  difficulty: z.string().min(1, "Difficulty is required"),
  knowledge_dimension: z.string().min(1, "Knowledge dimension is required"),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface QuestionBankFormProps {
  onSuccess: () => void;
}

const bloomLevels = [
  "Remembering",
  "Understanding", 
  "Applying",
  "Analyzing",
  "Evaluating",
  "Creating"
];

const knowledgeDimensions = [
  "Factual",
  "Conceptual", 
  "Procedural",
  "Metacognitive"
];

const topics = [
  "Requirements Engineering",
  "Data and Process Modeling",
  "Object Modeling",
  "System Design",
  "Testing and Quality Assurance"
];

const DRAFT_KEY = "questionbank-form.draft";

export function QuestionBankForm({ onSuccess }: QuestionBankFormProps) {
  const [draft, setDraft, clearDraft] = usePersistentState<{
    values: Partial<QuestionFormData>;
    choices: string[];
  }>(DRAFT_KEY, {
    values: {
      topic: "",
      text: "",
      type: "mcq",
      correct_answer: "",
      bloom_level: "",
      difficulty: "Easy",
      knowledge_dimension: "",
    },
    choices: ["", "", "", ""],
  });

  const [choices, setChoices] = useState<string[]>(draft.choices ?? ["", "", "", ""]);
  const { toast } = useToast();

  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      topic: draft.values.topic ?? "",
      text: draft.values.text ?? "",
      type: (draft.values.type as QuestionFormData["type"]) ?? "mcq",
      correct_answer: draft.values.correct_answer ?? "",
      bloom_level: draft.values.bloom_level ?? "",
      difficulty: draft.values.difficulty ?? "Easy",
      knowledge_dimension: draft.values.knowledge_dimension ?? "",
    },
  });

  // Persist every field change so a tab switch / refresh never wipes input.
  useEffect(() => {
    const sub = form.watch((values) => {
      setDraft({ values: values as Partial<QuestionFormData>, choices });
    });
    return () => sub.unsubscribe();
  }, [form, choices, setDraft]);

  const questionType = form.watch("type");

  const addChoice = () => {
    setChoices([...choices, ""]);
  };

  const removeChoice = (index: number) => {
    if (choices.length > 2) {
      setChoices(choices.filter((_, i) => i !== index));
    }
  };

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...choices];
    newChoices[index] = value;
    setChoices(newChoices);
  };

  const onSubmit = async (data: QuestionFormData) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      
      const questionData = {
        topic: data.topic,
        question_text: data.text,
        question_type: data.type,
        choices: questionType === "mcq" ? choices.filter(c => c.trim()).reduce((acc, choice, index) => {
          acc[String.fromCharCode(65 + index)] = choice
          return acc
        }, {} as Record<string, string>) : null,
        correct_answer: data.correct_answer,
        bloom_level: data.bloom_level,
        difficulty: data.difficulty,
        knowledge_dimension: data.knowledge_dimension,
        created_by: "teacher",
        approved: false,
        needs_review: false
      };

      const { error } = await supabase
        .from('questions')
        .insert([questionData])

      if (error) throw error
      
      toast({
        title: "Question Added",
        description: "Question has been successfully added to the bank.",
      });

      form.reset();
      setChoices(["", "", "", ""]);
      clearDraft();
      clearPersistedState(DRAFT_KEY);
      onSuccess();
    } catch (error) {
      console.error('Error saving question:', error)
      toast({
        title: "Error",
        description: "Failed to add question. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Question</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select topic" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {topics.map((topic) => (
                          <SelectItem key={topic} value={topic}>
                            {topic}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="mcq">Multiple Choice</SelectItem>
                        <SelectItem value="essay">Essay</SelectItem>
                        <SelectItem value="tf">True/False</SelectItem>
                        <SelectItem value="fill">Fill in the Blank</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Text</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter the question text..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {questionType === "mcq" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Answer Choices</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addChoice}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Choice
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {choices.map((choice, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <span className="w-6 text-sm font-medium">
                        {String.fromCharCode(65 + index)}.
                      </span>
                      <Input
                        value={choice}
                        onChange={(e) => updateChoice(index, e.target.value)}
                        placeholder={`Choice ${String.fromCharCode(65 + index)}`}
                        className="flex-1"
                      />
                      {choices.length > 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeChoice(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {questionType === "tf" && (
              <FormField
                control={form.control}
                name="correct_answer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correct Answer</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="True" id="true" />
                          <Label htmlFor="true">True</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="False" id="false" />
                          <Label htmlFor="false">False</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(questionType === "essay" || questionType === "fill") && (
              <FormField
                control={form.control}
                name="correct_answer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {questionType === "essay" ? "Sample Answer/Rubric" : "Correct Answer"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          questionType === "essay" 
                            ? "Enter sample answer or rubric..."
                            : "Enter the correct answer..."
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {questionType === "mcq" && (
              <FormField
                control={form.control}
                name="correct_answer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correct Answer</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select correct answer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {choices.map((choice, index) => (
                          choice.trim() && (
                            <SelectItem key={index} value={String.fromCharCode(65 + index)}>
                              {String.fromCharCode(65 + index)} - {choice}
                            </SelectItem>
                          )
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="bloom_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bloom's Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bloomLevels.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Average">Average</SelectItem>
                        <SelectItem value="Difficult">Difficult</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="knowledge_dimension"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Knowledge Dimension</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select dimension" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {knowledgeDimensions.map((dimension) => (
                          <SelectItem key={dimension} value={dimension}>
                            {dimension}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit">Add Question</Button>
              <Button type="button" variant="outline" onClick={() => form.reset()}>
                Reset Form
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}