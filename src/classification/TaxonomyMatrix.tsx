import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "lucide-react";

interface Question {
  id: string;
  cognitive_level?: string;
  bloom_level?: string;
  knowledge_dimension?: string;
  topic: string;
  difficulty?: string;
}

interface TaxonomyMatrixProps {
  questions: Question[];
  showConfidence?: boolean;
  showQualityIndicators?: boolean; // Backward compatibility
  interactive?: boolean;
  onCellClick?: (cognitiveLevel: string, knowledgeDimension: string) => void;
}

const cognitiveLevels = [
  { key: 'remembering', label: 'Remembering', color: 'bg-blue-50 hover:bg-blue-100' },
  { key: 'understanding', label: 'Understanding', color: 'bg-green-50 hover:bg-green-100' },
  { key: 'applying', label: 'Applying', color: 'bg-yellow-50 hover:bg-yellow-100' },
  { key: 'analyzing', label: 'Analyzing', color: 'bg-orange-50 hover:bg-orange-100' },
  { key: 'evaluating', label: 'Evaluating', color: 'bg-red-50 hover:bg-red-100' },
  { key: 'creating', label: 'Creating', color: 'bg-purple-50 hover:bg-purple-100' }
];

const knowledgeDimensions = [
  { key: 'factual', label: 'Factual', description: 'Basic facts, terminology, specific details' },
  { key: 'conceptual', label: 'Conceptual', description: 'Relationships, principles, theories' },
  { key: 'procedural', label: 'Procedural', description: 'Methods, techniques, algorithms' },
  { key: 'metacognitive', label: 'Metacognitive', description: 'Self-awareness, strategic thinking' }
];

export function TaxonomyMatrix({ 
  questions, 
  showConfidence = false, 
  showQualityIndicators = true, 
  interactive = true,
  onCellClick 
}: TaxonomyMatrixProps) {
  // Build matrix data
  const matrixData: Record<string, Record<string, Question[]>> = {};
  
  knowledgeDimensions.forEach(dim => {
    matrixData[dim.key] = {};
    cognitiveLevels.forEach(level => {
      matrixData[dim.key][level.key] = [];
    });
  });

  // Populate matrix
  questions.forEach(question => {
    const cogLevel = (question.cognitive_level || question.bloom_level || 'understanding').toLowerCase();
    const knowDim = (question.knowledge_dimension || 'conceptual').toLowerCase();
    
    if (matrixData[knowDim] && matrixData[knowDim][cogLevel]) {
      matrixData[knowDim][cogLevel].push(question);
    }
  });

  // Calculate totals
  const cognitiveTotal: Record<string, number> = {};
  const dimensionTotal: Record<string, number> = {};
  
  cognitiveLevels.forEach(level => {
    cognitiveTotal[level.key] = 0;
  });
  
  knowledgeDimensions.forEach(dim => {
    dimensionTotal[dim.key] = 0;
    cognitiveLevels.forEach(level => {
      const count = matrixData[dim.key][level.key].length;
      cognitiveTotal[level.key] += count;
      dimensionTotal[dim.key] += count;
    });
  });

  const grandTotal = Object.values(cognitiveTotal).reduce((sum, val) => sum + val, 0);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-Way Bloom's Taxonomy Matrix
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="w-4 h-4" />
          <span>
            Distribution of {grandTotal} questions across cognitive processes and knowledge dimensions
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48 font-bold sticky left-0 bg-background">
                  Knowledge Dimension ↓ / Cognitive Level →
                </TableHead>
                {cognitiveLevels.map(level => (
                  <TableHead key={level.key} className="text-center font-bold min-w-32">
                    <div className="space-y-1">
                      <div>{level.label}</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {cognitiveTotal[level.key]} total
                      </div>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-center font-bold w-24 sticky right-0 bg-background">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledgeDimensions.map(dimension => (
                <TableRow key={dimension.key}>
                  <TableCell className="font-medium sticky left-0 bg-background">
                    <div className="space-y-1">
                      <div className="font-semibold">{dimension.label}</div>
                      <div className="text-xs text-muted-foreground max-w-36">
                        {dimension.description}
                      </div>
                    </div>
                  </TableCell>
                  {cognitiveLevels.map(level => {
                    const cellQuestions = matrixData[dimension.key][level.key];
                    const count = cellQuestions.length;
                    const percentage = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : '0';
                    
                    return (
                      <TableCell 
                        key={`${dimension.key}-${level.key}`}
                        className={`text-center cursor-pointer transition-all ${level.color} border`}
                        onClick={() => onCellClick?.(level.key, dimension.key)}
                        title={`${level.label} × ${dimension.label}\n${count} questions (${percentage}%)`}
                      >
                        <div className="flex flex-col items-center gap-2 py-2">
                          <Badge 
                            variant={count > 0 ? "default" : "outline"} 
                            className="text-lg font-bold min-w-12"
                          >
                            {count}
                          </Badge>
                          {count > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground block">
                                {percentage}%
                              </span>
                              {/* Show difficulty breakdown if available */}
                              {cellQuestions.some(q => q.difficulty) && (
                                <div className="flex gap-1 justify-center">
                                  {['easy', 'medium', 'hard'].map(diff => {
                                    const diffCount = cellQuestions.filter(q => 
                                      q.difficulty?.toLowerCase() === diff
                                    ).length;
                                    return diffCount > 0 ? (
                                      <span key={diff} className="text-[10px] text-muted-foreground">
                                        {diff[0].toUpperCase()}:{diffCount}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-bold bg-muted sticky right-0">
                    {dimensionTotal[dimension.key]}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-bold">
                <TableCell className="sticky left-0 bg-muted">Total</TableCell>
                {cognitiveLevels.map(level => (
                  <TableCell key={level.key} className="text-center">
                    {cognitiveTotal[level.key]}
                  </TableCell>
                ))}
                <TableCell className="text-center text-lg sticky right-0 bg-muted">
                  {grandTotal}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <span className="inline-block w-3 h-3 bg-gradient-to-r from-blue-200 via-yellow-200 to-purple-200 rounded"></span>
                Cognitive Levels (Bloom's Taxonomy - Revised)
              </h4>
              <div className="space-y-1 text-xs">
                {cognitiveLevels.map(level => (
                  <div key={level.key} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded ${level.color} border`} />
                    <span className="font-medium">{level.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Knowledge Dimensions</h4>
              <div className="space-y-1 text-xs">
                {knowledgeDimensions.map(dim => (
                  <div key={dim.key}>
                    <span className="font-medium">{dim.label}:</span> {dim.description}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t text-xs text-muted-foreground">
            <p>
              <strong>Matrix Interpretation:</strong> Each cell shows the count of questions classified 
              by both their cognitive process (column) and knowledge dimension (row). Click any cell to 
              view or create questions for that classification. The percentage indicates the proportion 
              of total questions in each cell.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
