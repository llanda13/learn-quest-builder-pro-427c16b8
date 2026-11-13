import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Network, AlertTriangle, Eye, Trash2, Merge, Info, Layers } from 'lucide-react';
import { useSemanticAnalysis } from '@/hooks/useSemanticAnalysis';

interface SemanticSimilarityProps {
  questionText: string;
  questionId?: string;
  onSimilarQuestionClick?: (questionId: string) => void;
  onMergeQuestions?: (questionIds: string[]) => void;
  showClusters?: boolean;
  similarityThreshold?: number;
}

export const SemanticSimilarity: React.FC<SemanticSimilarityProps> = ({
  questionText,
  questionId,
  onSimilarQuestionClick,
  onMergeQuestions,
  showClusters = true,
  similarityThreshold = 0.7
}) => {
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const {
    similarQuestions,
    clusters,
    loading,
    error,
    analyzeQuestion,
    loadClusters,
    checkDuplicate
  } = useSemanticAnalysis({
    similarityThreshold
  });

  useEffect(() => {
    if (questionId) {
      analyzeQuestion(questionId).catch(console.error);
    }
  }, [questionId, analyzeQuestion]);

  useEffect(() => {
    if (showClusters) {
      loadClusters().catch(console.error);
    }
  }, [showClusters, loadClusters]);

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'text-red-600';
    if (similarity >= 0.8) return 'text-orange-600';
    if (similarity >= 0.7) return 'text-yellow-600';
    return 'text-blue-600';
  };

  const getSimilarityBadge = (similarity: number) => {
    if (similarity >= 0.9) return { variant: 'destructive' as const, label: 'Very High' };
    if (similarity >= 0.8) return { variant: 'destructive' as const, label: 'High' };
    if (similarity >= 0.7) return { variant: 'secondary' as const, label: 'Moderate' };
    return { variant: 'outline' as const, label: 'Low' };
  };

  const handleQuestionSelect = (questionId: string) => {
    setSelectedQuestions(prev => 
      prev.includes(questionId) 
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleMergeSelected = () => {
    if (selectedQuestions.length >= 2 && onMergeQuestions) {
      onMergeQuestions(selectedQuestions);
      setSelectedQuestions([]);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 animate-pulse" />
            Analyzing Semantic Similarity...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Progress value={33} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Comparing against question bank...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to analyze semantic similarity: {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const hasDuplicates = similarQuestions.some(q => q.similarity_score >= 0.85);
  const duplicateCount = similarQuestions.filter(q => q.similarity_score >= 0.85).length;

  return (
    <div className="space-y-4">
      {/* Redundancy Alert */}
      {hasDuplicates && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">
                Potential Redundancy Detected: {duplicateCount} similar questions found
              </p>
              <p className="text-sm">
                Questions with 85%+ similarity may be duplicates. Consider reviewing.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Similar Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5" />
              Similar Questions ({similarQuestions.length})
            </div>
            <div className="flex gap-2">
              {selectedQuestions.length >= 2 && onMergeQuestions && (
                <Button onClick={handleMergeSelected} size="sm" variant="outline">
                  <Merge className="w-4 h-4 mr-2" />
                  Merge Selected
                </Button>
              )}
              <Button 
                onClick={() => setShowDetails(!showDetails)}
                size="sm"
                variant="outline"
              >
                <Eye className="w-4 h-4 mr-2" />
                {showDetails ? 'Hide' : 'Show'} Details
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {similarQuestions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No similar questions found</p>
              <p className="text-sm">This question appears to be unique</p>
            </div>
          ) : (
            <div className="space-y-3">
              {similarQuestions.map((question, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge {...getSimilarityBadge(question.similarity_score)}>
                          {(question.similarity_score * 100).toFixed(1)}% Similar
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {question.topic}
                        </Badge>
                        {onMergeQuestions && (
                          <input
                            type="checkbox"
                            checked={selectedQuestions.includes(question.id)}
                            onChange={() => handleQuestionSelect(question.id)}
                            className="ml-2"
                          />
                        )}
                      </div>
                      <p className="text-sm font-medium mb-1">
                        {question.question_text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {question.bloom_level} • {question.difficulty}
                      </p>
                      {showDetails && (
                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                          <p>Algorithm: OpenAI text-embedding-3-small</p>
                          <p>Cosine similarity score: {question.similarity_score.toFixed(4)}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {onSimilarQuestionClick && (
                        <Button
                          onClick={() => onSimilarQuestionClick(question.id)}
                          size="sm"
                          variant="outline"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">Similarity Score:</span>
                    </div>
                    <Progress value={question.similarity_score * 100} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Question Clusters */}
      {showClusters && clusters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Question Clusters ({clusters.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clusters.map((cluster, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        Cluster {index + 1}
                      </Badge>
                      <Badge variant="secondary">
                        {cluster.length} questions
                      </Badge>
                      {cluster[0] && (
                        <Badge variant="outline">
                          {cluster[0].topic}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Questions in Cluster:</div>
                    {cluster.map((q, qi) => (
                      <div key={qi} className="text-sm p-2 bg-muted rounded">
                        {q.question_text.substring(0, 100)}...
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Summary */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm mb-2 text-blue-800">Semantic Analysis Summary</h4>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• Found {similarQuestions.length} similar questions above {(similarityThreshold * 100).toFixed(0)}% threshold</p>
                {showClusters && (
                  <p>• Identified {clusters.length} question clusters in the bank</p>
                )}
                {hasDuplicates && (
                  <p>• Detected {duplicateCount} potential duplicates (≥85% similarity)</p>
                )}
                <p>• Recommendation: {similarQuestions.length > 3 ? 'Review for potential consolidation' : 'Question appears sufficiently unique'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};