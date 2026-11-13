import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { distractorGenerator } from '@/services/ai/distractorGenerator';
import { difficultyCalibrator } from '@/services/ai/difficultyCalibrator';
import { objectiveAligner } from '@/services/ai/objectiveAligner';
import { redundancyDetector } from '@/services/ai/redundancyDetector';
import DistractorPreview from './DistractorPreview';
import DifficultyCalibration from './DifficultyCalibration';
import ObjectiveAlignment from './ObjectiveAlignment';

export default function IntelligentGenerator() {
  const [questionText, setQuestionText] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [topic, setTopic] = useState('');
  const [bloomLevel, setBloomLevel] = useState('understanding');
  const [difficulty, setDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);
  
  const [distractors, setDistractors] = useState<any[]>([]);
  const [calibration, setCalibration] = useState<any>(null);
  const [alignment, setAlignment] = useState<any>(null);
  const [redundancy, setRedundancy] = useState<any>(null);

  const handleGenerate = async () => {
    if (!questionText || !correctAnswer || !topic) {
      toast.error('Please fill in all required fields');
      return;
    }

    setGenerating(true);
    try {
      // Generate intelligent distractors
      const generatedDistractors = await distractorGenerator.generateDistractors({
        questionText,
        correctAnswer,
        topic,
        difficulty: difficulty as any,
        bloomLevel,
        numDistractors: 3
      });
      setDistractors(generatedDistractors);

      // Calibrate difficulty
      const difficultyResult = await difficultyCalibrator.calibrateDifficulty(
        questionText,
        'multiple_choice',
        bloomLevel,
        topic,
        [correctAnswer, ...generatedDistractors.map(d => d.text)]
      );
      setCalibration(difficultyResult);

      // Check redundancy (mock existing questions)
      const redundancyResult = await redundancyDetector.checkRedundancy(
        questionText,
        [], // Would normally fetch from database
        0.85
      );
      setRedundancy(redundancyResult);

      // Mock learning objectives for alignment
      const mockObjectives = [
        {
          id: '1',
          code: 'LO-001',
          description: `Students will be able to ${bloomLevel} concepts related to ${topic}`,
          bloomLevel,
          knowledgeDimension: 'conceptual',
          domain: topic
        }
      ];

      const alignmentResult = await objectiveAligner.alignToObjectives(
        questionText,
        bloomLevel,
        'conceptual',
        mockObjectives
      );
      setAlignment(alignmentResult);

      toast.success('Question analysis complete!');
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate question analysis');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Intelligent Question Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question">Question Text *</Label>
            <Textarea
              id="question"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter your question..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="answer">Correct Answer *</Label>
            <Input
              id="answer"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="Enter the correct answer..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic *</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Photosynthesis"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bloom">Bloom's Level</Label>
              <Select value={bloomLevel} onValueChange={setBloomLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remembering">Remembering</SelectItem>
                  <SelectItem value="understanding">Understanding</SelectItem>
                  <SelectItem value="applying">Applying</SelectItem>
                  <SelectItem value="analyzing">Analyzing</SelectItem>
                  <SelectItem value="evaluating">Evaluating</SelectItem>
                  <SelectItem value="creating">Creating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty">Target Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            <Wand2 className="mr-2 h-4 w-4" />
            {generating ? 'Generating...' : 'Generate & Analyze'}
          </Button>
        </CardContent>
      </Card>

      {distractors.length > 0 && (
        <DistractorPreview distractors={distractors} correctAnswer={correctAnswer} />
      )}

      {calibration && (
        <DifficultyCalibration calibration={calibration} />
      )}

      {alignment && (
        <ObjectiveAlignment alignment={alignment} />
      )}

      {redundancy && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {redundancy.isDuplicate ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              Redundancy Check
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{redundancy.recommendation}</p>
            {redundancy.similarQuestions.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Similar questions found:</p>
                <ul className="text-sm space-y-1">
                  {redundancy.similarQuestions.slice(0, 3).map((q: any, i: number) => (
                    <li key={i} className="text-muted-foreground">
                      • Similarity: {(q.similarity * 100).toFixed(1)}% - {q.text.substring(0, 60)}...
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
