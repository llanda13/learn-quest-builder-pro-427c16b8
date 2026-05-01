import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Shuffle, Download, Eye, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateUUID } from '@/utils/uuid';
import { generateMultipleVersions, validateVersionBalance } from '@/services/testGeneration/multiVersionGenerator';
import TestDistribution from '@/components/testGeneration/TestDistribution';
import type { Json } from '@/integrations/supabase/types';

interface Question {
  id: string;
  topic: string;
  question_text: string;
  question_type: string;
  bloom_level: string;
  difficulty: string;
  choices?: string[];
  correct_answer?: string;
}

interface TestVersion {
  version: string;
  questions: Question[];
  answerKey: Record<string, string>;
}

interface MultiVersionTestGeneratorProps {
  onBack: () => void;
}

export default function MultiVersionTestGenerator({ onBack }: MultiVersionTestGeneratorProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [numberOfVersions, setNumberOfVersions] = useState(3);
  const [questionsPerVersion, setQuestionsPerVersion] = useState(20);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [preventDuplicates, setPreventDuplicates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savedTestId, setSavedTestId] = useState<string | null>(null);
  const [versionIds, setVersionIds] = useState<string[]>([]);
  const [showDistribution, setShowDistribution] = useState(false);
  const [balanceMetrics, setBalanceMetrics] = useState<any>(null);
  const { toast } = useToast();

  const generateVersions = async () => {
    setLoading(true);
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .eq('approved', true)
        .limit(questionsPerVersion);

      if (error) throw error;

      if (!questions || questions.length < questionsPerVersion) {
        toast({
          title: "Insufficient Questions",
          description: `Need at least ${questionsPerVersion} approved questions.`,
          variant: "destructive",
        });
        return;
      }

      const generatedVersions = await generateMultipleVersions(questions as any, {
        numberOfVersions,
        shuffleQuestions,
        shuffleChoices,
        preventAdjacentDuplicates: preventDuplicates,
        balanceDistributions: true
      });

      const balance = validateVersionBalance(generatedVersions);
      setBalanceMetrics(balance);

      const savedVersionIds: string[] = [];
      const firstVersionId = generateUUID();
      
      for (const version of generatedVersions) {
        const { data, error: insertError } = await supabase
          .from('generated_tests')
          .insert({
            id: version.version_number === 1 ? firstVersionId : undefined,
            parent_test_id: version.version_number === 1 ? null : firstVersionId,
            title: `Multi-Version Test`,
            subject: 'Generated Test',
            items: version.questions as any,
            answer_key: version.answer_key as any,
            version_label: version.version_label,
            version_number: version.version_number,
            shuffle_seed: version.shuffle_seed,
            question_order: version.question_order as any,
            shuffle_questions: shuffleQuestions,
            shuffle_choices: shuffleChoices
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (data) savedVersionIds.push(data.id);
      }

      setVersions(generatedVersions);
      setSavedTestId(firstVersionId);
      setVersionIds(savedVersionIds);
      
      toast({
        title: "Versions Generated",
        description: `Successfully generated ${numberOfVersions} balanced test versions.`,
      });
    } catch (error) {
      console.error('Error generating versions:', error);
      toast({
        title: "Error",
        description: "Failed to generate test versions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Multi-Version Test Generator</h1>
          <p className="text-muted-foreground">Generate multiple versions of the same test</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generation Settings</CardTitle>
          <CardDescription>Configure how many versions to generate</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="versions">Number of Versions</Label>
              <Input
                id="versions"
                type="number"
                min="2"
                max="10"
                value={numberOfVersions}
                onChange={(e) => setNumberOfVersions(parseInt(e.target.value) || 2)}
              />
            </div>
            <div>
              <Label htmlFor="questions">Questions per Version</Label>
              <Input
                id="questions"
                type="number"
                min="5"
                max="100"
                value={questionsPerVersion}
                onChange={(e) => setQuestionsPerVersion(parseInt(e.target.value) || 20)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="shuffle-questions">Shuffle Question Order</Label>
              <Switch
                id="shuffle-questions"
                checked={shuffleQuestions}
                onCheckedChange={setShuffleQuestions}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="shuffle-choices">Shuffle Answer Choices</Label>
              <Switch
                id="shuffle-choices"
                checked={shuffleChoices}
                onCheckedChange={setShuffleChoices}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="prevent-duplicates">Prevent Adjacent Duplicates</Label>
              <Switch
                id="prevent-duplicates"
                checked={preventDuplicates}
                onCheckedChange={setPreventDuplicates}
              />
            </div>
          </div>
          
          <Button onClick={generateVersions} disabled={loading} className="w-full gap-2">
            <Shuffle className="w-4 h-4" />
            {loading ? 'Generating...' : 'Generate Versions'}
          </Button>
        </CardContent>
      </Card>

      {balanceMetrics && (
        <Card>
          <CardHeader>
            <CardTitle>Version Balance Metrics</CardTitle>
            <CardDescription>Distribution analysis across all versions</CardDescription>
          </CardHeader>
          <CardContent>
            {balanceMetrics.isBalanced ? (
              <div className="flex items-center gap-2 text-green-600">
                <Badge variant="outline" className="border-green-600">Balanced</Badge>
                <span className="text-sm">All versions maintain balanced distributions</span>
              </div>
            ) : (
              <div className="space-y-2">
                <Badge variant="outline" className="border-yellow-600">Warnings Detected</Badge>
                {balanceMetrics.warnings.map((warning: string, i: number) => (
                  <p key={i} className="text-sm text-yellow-600">{warning}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {versions.length > 0 && !showDistribution && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Generated Versions</h2>
            <Button onClick={() => setShowDistribution(true)} variant="outline" className="gap-2">
              <FileText className="w-4 h-4" />
              Distribute to Students
            </Button>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {versions.map((version: any) => (
              <Card key={version.version_label}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Version {version.version_label}
                    <Badge variant="secondary">{version.questions.length} questions</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p>Questions: {version.questions.length}</p>
                    <p>Topics covered: {new Set(version.questions.map((q: any) => q.topic)).size}</p>
                    <p className="font-mono text-xs mt-2">Seed: {version.shuffle_seed.substring(0, 12)}...</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Sample Questions:</h4>
                    <div className="space-y-1 text-xs">
                      {version.questions.slice(0, 3).map((q: any, index: number) => (
                        <div key={index} className="truncate">
                          {index + 1}. {q.question_text}
                        </div>
                      ))}
                      {version.questions.length > 3 && (
                        <div className="text-muted-foreground">
                          ... and {version.questions.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-2">
                      <Eye className="w-4 h-4" />
                      Preview
                    </Button>
                    <Button size="sm" className="flex-1 gap-2">
                      <Download className="w-4 h-4" />
                      Export
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {showDistribution && savedTestId && versionIds.length > 0 && (
        <TestDistribution
          parentTestId={savedTestId}
          versionIds={versionIds}
          onComplete={() => {
            toast({
              title: "Distribution Complete",
              description: "Test versions have been assigned to students"
            });
          }}
        />
      )}
    </div>
  );
}