import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Edit, Plus, Upload, Brain, FileText, BarChart3, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useRealtimeQuestions } from "@/hooks/useRealtimeQuestions";
import { Question, getQuestions, deleteQuestion, approveQuestion, bulkInsertQuestions } from "@/lib/supabaseClient";
import { classifyQuestions } from "@/services/edgeFunctions";
import BulkImport from "./BulkImport";
import { QuestionForm } from "./QuestionForm";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicHierarchy } from "@/hooks/useAcademicHierarchy";
import { normalizeKnowledgeDimension } from "@/types/knowledge";

interface EnhancedQuestionBankProps {
  onBack: () => void;
}

export default function EnhancedQuestionBank({ onBack }: EnhancedQuestionBankProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedBloomLevel, setSelectedBloomLevel] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [generationSubjectId, setGenerationSubjectId] = useState("");
  const [showApprovedOnly, setShowApprovedOnly] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  
  const { toast } = useToast();
  const { profile, isAdmin } = useProfile();
  const { questions: realtimeQuestions } = useRealtimeQuestions();
  const hierarchy = useAcademicHierarchy();
  const generationSubject = hierarchy.allSubjects.find(subject => subject.id === generationSubjectId);

  // Sync realtime questions with local state
  useEffect(() => {
    if (realtimeQuestions.length > 0) {
      setQuestions(realtimeQuestions);
    }
  }, [realtimeQuestions]);

  // Load questions on mount
  useEffect(() => {
    fetchQuestions();
  }, []);

  // Filter questions based on search and filters
  useEffect(() => {
    let filtered = questions;

    if (searchTerm) {
      filtered = filtered.filter(q => 
        q.question_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.topic.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedTopic && selectedTopic !== "all") {
      filtered = filtered.filter(q => q.topic === selectedTopic);
    }

    if (selectedBloomLevel && selectedBloomLevel !== "all") {
      filtered = filtered.filter(q => q.bloom_level === selectedBloomLevel);
    }

    if (selectedDifficulty && selectedDifficulty !== "all") {
      filtered = filtered.filter(q => q.difficulty === selectedDifficulty);
    }

    if (showApprovedOnly) {
      filtered = filtered.filter(q => q.approved);
    }

    setFilteredQuestions(filtered);
  }, [questions, searchTerm, selectedTopic, selectedBloomLevel, selectedDifficulty, showApprovedOnly]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const data = await getQuestions();
      setQuestions(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch questions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteQuestion(id);
      toast({
        title: "Success",
        description: "Question deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive"
      });
    }
  };

  const handleApprovalToggle = async (id: string, approved: boolean) => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can approve questions",
        variant: "destructive"
      });
      return;
    }

    try {
      await approveQuestion(id, approved);
      toast({
        title: "Success",
        description: `Question ${approved ? 'approved' : 'unapproved'} successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update question approval",
        variant: "destructive"
      });
    }
  };

  const handleBulkImport = async (csvData: any[]) => {
    try {
      // Classify questions automatically
      const questionsToClassify = csvData.map(row => ({
        text: row['Question Text'] || row.question_text || '',
        type: row['Question Type'] || row.question_type || 'mcq',
        topic: row.Topic || row.topic || 'General'
      }));

      const classifications = await classifyQuestions(questionsToClassify);

      const questionsToInsert = csvData.map((row, index) => {
        const classification = classifications[index];
        return {
          topic: row.Topic || row.topic || 'General',
          question_text: row['Question Text'] || row.question_text || '',
          question_type: 'multiple-choice',
          choices: row.choices ? JSON.parse(row.choices) : {
            A: row['Choice A'] || '',
            B: row['Choice B'] || '',
            C: row['Choice C'] || '',
            D: row['Choice D'] || ''
          },
          correct_answer: row['Correct Answer'] || row.correct_answer || 'A',
          bloom_level: classification?.bloom_level || 'Understanding',
          difficulty: classification?.difficulty || 'Average',
          knowledge_dimension: normalizeKnowledgeDimension(classification?.knowledge_dimension),
          created_by: 'teacher',
          approved: false,
          ai_confidence_score: classification?.confidence || 0.5,
          needs_review: classification?.confidence < 0.8
        };
      });

      await bulkInsertQuestions(questionsToInsert);
      
      toast({
        title: "Success",
        description: `Imported ${questionsToInsert.length} questions with AI classification`
      });
      
      setShowBulkImport(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to import questions",
        variant: "destructive"
      });
    }
  };

  const generateQuestionsWithAI = async () => {
    try {
      if (!generationSubject) {
        toast({ title: "Subject required", description: "Select a registered academic subject before generating questions.", variant: "destructive" });
        return;
      }
      const response = await supabase.functions.invoke('generate-questions', {
        body: {
          subject_code: generationSubject.code,
          subject_description: generationSubject.description,
          category: generationSubject.category_name,
          specialization: generationSubject.specialization_name,
          request: {
            topic: selectedTopic || 'General',
            bloom_level: selectedBloomLevel || 'Understanding',
            difficulty: selectedDifficulty || 'Average',
            count: 5
          }
        }
      });

      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: `Generated ${response.data.inserted_count} AI questions`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate questions with AI",
        variant: "destructive"
      });
    }
  };

  // Get unique values for filters
  const topics = [...new Set(questions.map(q => q.topic))];
  const bloomLevels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
  const difficulties = ['Easy', 'Average', 'Difficult'];

  // Calculate stats
  const stats = {
    total: questions.length,
    approved: questions.filter(q => q.approved).length,
    pending: questions.filter(q => !q.approved).length,
    aiGenerated: questions.filter(q => q.created_by === 'ai').length,
    teacherCreated: questions.filter(q => q.created_by === 'teacher').length
  };

  if (showBulkImport) {
    return <BulkImport onClose={() => setShowBulkImport(false)} onImportComplete={fetchQuestions} />;
  }

  if (showQuestionForm) {
    return (
      <QuestionForm 
        onSave={() => {
          setShowQuestionForm(false);
          setEditingQuestion(null);
          fetchQuestions();
        }}
        onCancel={() => {
          setShowQuestionForm(false);
          setEditingQuestion(null);
        }}
        existingQuestion={editingQuestion}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Enhanced Question Bank</h1>
            <p className="text-muted-foreground">
              AI-powered question management with automatic classification
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Questions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <div className="text-sm text-muted-foreground">Approved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pending Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.aiGenerated}</div>
            <div className="text-sm text-muted-foreground">AI Generated</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.teacherCreated}</div>
            <div className="text-sm text-muted-foreground">Teacher Created</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <Button onClick={() => setShowQuestionForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
        <Button onClick={() => setShowBulkImport(true)} variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Bulk Import
        </Button>
        <Button onClick={generateQuestionsWithAI} variant="outline">
          <Brain className="h-4 w-4 mr-2" />
          Generate with AI
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <label className="text-sm font-medium">Subject for AI generation</label>
            <Select value={generationSubjectId} onValueChange={setGenerationSubjectId}>
              <SelectTrigger><SelectValue placeholder="Select a registered subject" /></SelectTrigger>
              <SelectContent>
                {hierarchy.allSubjects.map(subject => (
                  <SelectItem key={subject.id} value={subject.id}>{subject.code} - {subject.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              placeholder="Search questions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {topics.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedBloomLevel} onValueChange={setSelectedBloomLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Bloom's level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {bloomLevels.map(level => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                {difficulties.map(difficulty => (
                  <SelectItem key={difficulty} value={difficulty}>{difficulty}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="approved-only"
              checked={showApprovedOnly}
              onCheckedChange={setShowApprovedOnly}
            />
            <label htmlFor="approved-only" className="text-sm">
              Show approved questions only
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">Loading questions...</div>
        ) : filteredQuestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No questions found matching your criteria
          </div>
        ) : (
          filteredQuestions.map((question) => (
            <Card key={question.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{question.topic}</Badge>
                      <Badge variant="secondary">{question.bloom_level}</Badge>
                      <Badge 
                        variant={
                          question.difficulty === 'Easy' ? 'default' :
                          question.difficulty === 'Average' ? 'secondary' : 'destructive'
                        }
                      >
                        {question.difficulty}
                      </Badge>
                      <Badge variant="outline">{question.knowledge_dimension}</Badge>
                      {question.created_by === 'ai' && (
                        <Badge variant="outline" className="bg-purple-50">
                          <Brain className="h-3 w-3 mr-1" />
                          AI Generated
                        </Badge>
                      )}
                      {question.confidence_score && (
                        <Badge variant="outline">
                          {Math.round(question.confidence_score * 100)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mb-3">{question.question_text}</p>
                    {question.choices && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {Object.entries(question.choices).map(([key, value]) => (
                          <div key={key} className={question.correct_answer === key ? 'font-medium text-green-600' : ''}>
                            {key}. {String(value)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={question.approved}
                          onCheckedChange={(checked) => handleApprovalToggle(question.id!, checked)}
                        />
                        <span className="text-sm">
                          {question.approved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={() => {
                        setEditingQuestion(question);
                        setShowQuestionForm(true);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleDeleteQuestion(question.id!)}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}