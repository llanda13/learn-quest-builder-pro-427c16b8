import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Target, Info, Eye, Download } from 'lucide-react';
import { mlClassifier } from '@/services/ai/mlClassifier';
import { toast } from 'sonner';

interface TaxonomyCell {
  bloomLevel: string;
  knowledgeDimension: string;
  questionCount: number;
  questions: Array<{
    id: string;
    text: string;
    confidence: number;
    quality: number;
  }>;
  coverage: number;
  averageQuality: number;
}

interface TaxonomyMatrixProps {
  questions?: any[];
  onCellClick?: (bloomLevel: string, knowledgeDimension: string) => void;
  showQualityIndicators?: boolean;
  interactive?: boolean;
}

export const TaxonomyMatrix: React.FC<TaxonomyMatrixProps> = ({
  questions = [],
  onCellClick,
  showQualityIndicators = true,
  interactive = true
}) => {
  const [matrixData, setMatrixData] = useState<TaxonomyCell[][]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ bloom: string; knowledge: string } | null>(null);

  const bloomLevels = [
    'remembering',
    'understanding', 
    'applying',
    'analyzing',
    'evaluating',
    'creating'
  ];

  const knowledgeDimensions = [
    'factual',
    'conceptual',
    'procedural',
    'metacognitive'
  ];

  useEffect(() => {
    buildMatrix();
  }, [questions]);

  const buildMatrix = async () => {
    setLoading(true);
    try {
      const matrix: TaxonomyCell[][] = [];

      for (let i = 0; i < bloomLevels.length; i++) {
        const row: TaxonomyCell[] = [];
        
        for (let j = 0; j < knowledgeDimensions.length; j++) {
          const bloomLevel = bloomLevels[i];
          const knowledgeDimension = knowledgeDimensions[j];
          
          // Filter questions for this cell
          const cellQuestions = questions.filter(q => 
            q.bloom_level?.toLowerCase() === bloomLevel &&
            q.knowledge_dimension?.toLowerCase() === knowledgeDimension
          );

          // Calculate metrics for this cell
          const questionCount = cellQuestions.length;
          const averageQuality = questionCount > 0 
            ? cellQuestions.reduce((sum, q) => sum + (q.quality_score || 0.7), 0) / questionCount
            : 0;
          
          const coverage = questionCount > 0 ? Math.min(1, questionCount / 5) : 0; // Target 5 questions per cell

          const cell: TaxonomyCell = {
            bloomLevel,
            knowledgeDimension,
            questionCount,
            questions: cellQuestions.map(q => ({
              id: q.id,
              text: q.question_text,
              confidence: q.ai_confidence_score || 0.7,
              quality: q.quality_score || 0.7
            })),
            coverage,
            averageQuality
          };

          row.push(cell);
        }
        
        matrix.push(row);
      }

      setMatrixData(matrix);
    } catch (error) {
      console.error('Error building taxonomy matrix:', error);
      toast.error('Failed to build taxonomy matrix');
    } finally {
      setLoading(false);
    }
  };

  const getCellColor = (cell: TaxonomyCell) => {
    if (cell.questionCount === 0) return 'bg-gray-100 border-gray-200';
    
    const qualityScore = cell.averageQuality;
    const coverage = cell.coverage;
    
    // Combine quality and coverage for color
    const combinedScore = (qualityScore + coverage) / 2;
    
    if (combinedScore >= 0.8) return 'bg-green-100 border-green-300 text-green-800';
    if (combinedScore >= 0.6) return 'bg-blue-100 border-blue-300 text-blue-800';
    if (combinedScore >= 0.4) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    return 'bg-red-100 border-red-300 text-red-800';
  };

  const getCellIntensity = (cell: TaxonomyCell) => {
    const maxQuestions = Math.max(...matrixData.flat().map(c => c.questionCount));
    return maxQuestions > 0 ? cell.questionCount / maxQuestions : 0;
  };

  const handleCellClick = (bloomLevel: string, knowledgeDimension: string) => {
    if (!interactive) return;
    
    setSelectedCell({ bloom: bloomLevel, knowledge: knowledgeDimension });
    onCellClick?.(bloomLevel, knowledgeDimension);
  };

  const exportMatrix = () => {
    const csvData = [
      ['Bloom Level', 'Knowledge Dimension', 'Question Count', 'Average Quality', 'Coverage'],
      ...matrixData.flat().map(cell => [
        cell.bloomLevel,
        cell.knowledgeDimension,
        cell.questionCount.toString(),
        cell.averageQuality.toFixed(2),
        (cell.coverage * 100).toFixed(1) + '%'
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'taxonomy-matrix.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Matrix data exported successfully');
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Two-Way Taxonomy Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-full"></div>
            <div className="grid grid-cols-4 gap-2">
              {[...Array(24)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Two-Way Bloom's Taxonomy Matrix
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportMatrix}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total Questions: {questions.length}</span>
            <span>•</span>
            <span>Matrix Cells: {bloomLevels.length} × {knowledgeDimensions.length}</span>
            <span>•</span>
            <span>Coverage: {matrixData.flat().filter(c => c.questionCount > 0).length}/{bloomLevels.length * knowledgeDimensions.length} cells</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-3 border border-border bg-muted font-semibold text-left min-w-[120px]">
                    Bloom's Level
                  </th>
                  {knowledgeDimensions.map((dimension) => (
                    <th key={dimension} className="p-3 border border-border bg-muted font-semibold text-center min-w-[140px]">
                      <div className="space-y-1">
                        <div className="capitalize font-semibold">{dimension}</div>
                        <div className="text-xs text-muted-foreground">Knowledge</div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloomLevels.map((bloomLevel, bloomIndex) => (
                  <tr key={bloomLevel}>
                    <td className="p-3 border border-border bg-muted/50 font-medium">
                      <div className="space-y-1">
                        <div className="capitalize font-semibold">{bloomLevel}</div>
                        <div className="text-xs text-muted-foreground">
                          {matrixData[bloomIndex]?.reduce((sum, cell) => sum + cell.questionCount, 0) || 0} questions
                        </div>
                      </div>
                    </td>
                    {knowledgeDimensions.map((knowledgeDimension, dimIndex) => {
                      const cell = matrixData[bloomIndex]?.[dimIndex];
                      if (!cell) return <td key={dimIndex} className="p-3 border border-border"></td>;

                      return (
                        <Tooltip key={dimIndex}>
                          <TooltipTrigger asChild>
                            <td
                              className={`p-3 border border-border cursor-pointer transition-all hover:shadow-md ${getCellColor(cell)} ${
                                selectedCell?.bloom === bloomLevel && selectedCell?.knowledge === knowledgeDimension
                                  ? 'ring-2 ring-primary'
                                  : ''
                              }`}
                              onClick={() => handleCellClick(bloomLevel, knowledgeDimension)}
                              style={{
                                opacity: 0.3 + (getCellIntensity(cell) * 0.7)
                              }}
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs">
                                    {cell.questionCount}
                                  </Badge>
                                  {showQualityIndicators && (
                                    <div className="flex items-center gap-1">
                                      <div className={`w-2 h-2 rounded-full ${
                                        cell.averageQuality >= 0.8 ? 'bg-green-500' :
                                        cell.averageQuality >= 0.6 ? 'bg-yellow-500' :
                                        'bg-red-500'
                                      }`} />
                                    </div>
                                  )}
                                </div>
                                
                                {cell.questionCount > 0 && (
                                  <div className="space-y-1">
                                    <Progress value={cell.coverage * 100} className="h-1" />
                                    <div className="text-xs text-center">
                                      {(cell.coverage * 100).toFixed(0)}% coverage
                                    </div>
                                  </div>
                                )}
                                
                                {cell.questionCount === 0 && (
                                  <div className="text-xs text-center text-muted-foreground">
                                    No questions
                                  </div>
                                )}
                              </div>
                            </td>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-2">
                              <div className="font-semibold">
                                {bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1)} × {knowledgeDimension.charAt(0).toUpperCase() + knowledgeDimension.slice(1)}
                              </div>
                              <div className="text-sm space-y-1">
                                <div>Questions: {cell.questionCount}</div>
                                <div>Average Quality: {(cell.averageQuality * 100).toFixed(1)}%</div>
                                <div>Coverage: {(cell.coverage * 100).toFixed(1)}%</div>
                              </div>
                              {cell.questions.length > 0 && (
                                <div className="text-xs">
                                  <div className="font-medium mb-1">Sample Questions:</div>
                                  {cell.questions.slice(0, 2).map((q, i) => (
                                    <div key={i} className="truncate">
                                      • {q.text.substring(0, 50)}...
                                    </div>
                                  ))}
                                  {cell.questions.length > 2 && (
                                    <div className="text-muted-foreground">
                                      +{cell.questions.length - 2} more
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="p-4 border-t bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Legend:</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                    <span>High Quality & Coverage</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
                    <span>Moderate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
                    <span>Needs Improvement</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div>
                    <span>No Questions</span>
                  </div>
                </div>
              </div>
              
              {showQualityIndicators && (
                <div className="flex items-center gap-2 text-xs">
                  <span>Quality Indicators:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>High</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span>Medium</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Low</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};