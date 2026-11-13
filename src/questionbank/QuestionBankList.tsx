import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit, Trash2, Bot, User, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Question {
  id: string;
  topic: string;
  question_text: string;
  question_type: string;
  choices?: any;
  correct_answer: string;
  bloom_level: string;
  difficulty: string;
  knowledge_dimension: string;
  created_by: string;
  created_at: string;
}

export function QuestionBankList() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [bloomFilter, setBloomFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      toast({
        title: "Error",
        description: "Failed to load questions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('questions')
        .update({ deleted: true, updated_at: new Date().toISOString() } as any)
        .eq('id', questionId);

      if (error) throw error;

      setQuestions(questions.filter(q => q.id !== questionId));
      toast({
        title: "Question Deleted",
        description: "Question has been moved to Recently Deleted.",
      });
    } catch (error) {
      console.error('Error deleting question:', error);
      toast({
        title: "Error", 
        description: "Failed to delete question.",
        variant: "destructive",
      });
    }
  };

  const filteredQuestions = questions.filter(question => {
    const matchesSearch = question.question_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         question.topic.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTopic = topicFilter === "all" || question.topic === topicFilter;
    const matchesBloom = bloomFilter === "all" || question.bloom_level === bloomFilter;
    const matchesDifficulty = difficultyFilter === "all" || question.difficulty === difficultyFilter;
    const matchesSource = sourceFilter === "all" || question.created_by === sourceFilter;

    return matchesSearch && matchesTopic && matchesBloom && matchesDifficulty && matchesSource;
  });

  const getTypeDisplay = (type: string) => {
    const types = {
      mcq: "Multiple Choice",
      essay: "Essay",
      tf: "True/False",
      fill: "Fill in the Blank"
    };
    return types[type as keyof typeof types] || type;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading questions...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy": return "bg-green-100 text-green-800";
      case "Average": return "bg-yellow-100 text-yellow-800";
      case "Difficult": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getBloomColor = (level: string) => {
    const colors = {
      "Remembering": "bg-blue-100 text-blue-800",
      "Understanding": "bg-green-100 text-green-800",
      "Applying": "bg-yellow-100 text-yellow-800",
      "Analyzing": "bg-orange-100 text-orange-800",
      "Evaluating": "bg-red-100 text-red-800",
      "Creating": "bg-purple-100 text-purple-800"
    };
    return colors[level as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                <SelectItem value="Requirements Engineering">Requirements Engineering</SelectItem>
                <SelectItem value="Data and Process Modeling">Data and Process Modeling</SelectItem>
                <SelectItem value="Object Modeling">Object Modeling</SelectItem>
              </SelectContent>
            </Select>

            <Select value={bloomFilter} onValueChange={setBloomFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Bloom's Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="Remembering">Remembering</SelectItem>
                <SelectItem value="Understanding">Understanding</SelectItem>
                <SelectItem value="Applying">Applying</SelectItem>
                <SelectItem value="Analyzing">Analyzing</SelectItem>
                <SelectItem value="Evaluating">Evaluating</SelectItem>
                <SelectItem value="Creating">Creating</SelectItem>
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Difficulties</SelectItem>
                <SelectItem value="Easy">Easy</SelectItem>
                <SelectItem value="Average">Average</SelectItem>
                <SelectItem value="Difficult">Difficult</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="ai">AI Generated</SelectItem>
                <SelectItem value="teacher">Teacher Added</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question Bank ({filteredQuestions.length} questions)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Bloom's Level</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuestions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell className="max-w-md">
                    <div className="space-y-1">
                      <p className="text-sm font-medium line-clamp-2">
                        {question.question_text}
                      </p>
                      {question.question_type === "mcq" && question.choices && typeof question.choices === 'object' && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          {Object.entries(question.choices).map(([key, value]) => (
                            <div key={key} className={`${question.correct_answer === key ? 'font-medium text-green-600' : ''}`}>
                              {key}. {String(value)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {question.topic}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {getTypeDisplay(question.question_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getBloomColor(question.bloom_level)}`}>
                      {question.bloom_level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
                      {question.difficulty}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {question.created_by === "ai" ? (
                        <Bot className="h-4 w-4 text-blue-500" />
                      ) : (
                        <User className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-xs capitalize">{question.created_by}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      Available
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDelete(question.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredQuestions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No questions found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}