import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { shuffleExamChoices } from '@/utils/shuffleExamChoices';

interface RepairResult {
  repaired: boolean;
  originalCount: number;
  repairedCount: number;
  addedQuestions: number;
}

/**
 * Hook to auto-repair incomplete tests by filling missing slots
 * from bank questions or AI generation
 */
export function useTestAutoRepair(testId: string | undefined) {
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const { toast } = useToast();

  const checkAndRepair = useCallback(async (test: any): Promise<any> => {
    if (!test || !test.tos_id) {
      console.log('⚠️ No TOS ID on test - cannot auto-repair');
      return test;
    }

    const items = Array.isArray(test.items) ? test.items : [];
    
    // Fetch TOS to get required total
    const { data: tos, error: tosError } = await supabase
      .from('tos_entries')
      .select('total_items, distribution, topics')
      .eq('id', test.tos_id)
      .single();

    if (tosError || !tos) {
      console.log('⚠️ Could not fetch TOS for repair check');
      return test;
    }

    const requiredTotal = tos.total_items || 0;
    const currentCount = items.length;

    console.log(`🔍 Auto-repair check: ${currentCount}/${requiredTotal} questions`);

    if (currentCount >= requiredTotal) {
      console.log('✅ Test is complete - no repair needed');
      return test;
    }

    // Test is incomplete - needs repair
    setIsRepairing(true);

    try {
      const missing = requiredTotal - currentCount;
      console.log(`🔧 Auto-repairing: need ${missing} more questions`);

      // Build distributions from TOS for gap filling
      const distributions = buildDistributionsFromTOS(tos, items);
      
      if (distributions.length === 0) {
        console.log('⚠️ Could not determine distributions for repair');
        setIsRepairing(false);
        return test;
      }

      // Call edge function to generate missing questions
      const { data, error } = await supabase.functions.invoke('generate-questions-from-tos', {
        body: {
          tos_id: test.tos_id,
          total_items: missing,
          distributions,
          allow_unapproved: false,
          prefer_existing: true
        }
      });

      if (error || !data?.questions) {
        console.error('❌ Auto-repair generation failed:', error);
        toast({
          title: 'Auto-repair failed',
          description: 'Could not generate missing questions',
          variant: 'destructive'
        });
        setIsRepairing(false);
        return test;
      }

      const newQuestions = data.questions || [];
      console.log(`✅ Generated ${newQuestions.length} repair questions`);

      if (newQuestions.length < missing) {
        toast({
          title: 'Auto-repair incomplete',
          description: `Only generated ${newQuestions.length}/${missing} missing questions. Test was not updated.`,
          variant: 'destructive'
        });
        return test;
      }

      // Merge with existing items
      const repairedItems = shuffleExamChoices([
        ...items,
        ...newQuestions.slice(0, missing).map((q: any, idx: number) => ({
          ...q,
          question_number: currentCount + idx + 1
        }))
      ]).items.map((q: any, idx: number) => ({ ...q, question_number: idx + 1 }));

      // Update answer key
      const repairedAnswerKey = repairedItems.map((q: any, idx: number) => ({
        question_number: idx + 1,
        question_id: q.id,
        correct_answer: q.correct_answer,
        points: q.points || 1
      }));

      // Update the test in database
      const { error: updateError } = await supabase
        .from('generated_tests')
        .update({
          items: repairedItems,
          answer_key: repairedAnswerKey
        })
        .eq('id', testId);

      if (updateError) {
        console.error('❌ Failed to save repaired test:', updateError);
        toast({
          title: 'Auto-repair failed',
          description: 'Could not save repaired test',
          variant: 'destructive'
        });
        setIsRepairing(false);
        return test;
      }

      const result: RepairResult = {
        repaired: true,
        originalCount: currentCount,
        repairedCount: repairedItems.length,
        addedQuestions: newQuestions.length
      };

      setRepairResult(result);
      
      toast({
        title: 'Test auto-repaired',
        description: `Added ${newQuestions.length} missing questions (${currentCount} → ${repairedItems.length})`,
      });

      console.log(`✅ Auto-repair complete: ${result.originalCount} → ${result.repairedCount}`);
      
      return {
        ...test,
        items: repairedItems,
        answer_key: repairedAnswerKey
      };

    } catch (err) {
      console.error('❌ Auto-repair error:', err);
      toast({
        title: 'Auto-repair failed',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
      return test;
    } finally {
      setIsRepairing(false);
    }
  }, [testId, toast]);

  return { checkAndRepair, isRepairing, repairResult };
}

/**
 * Build distribution requirements from TOS, accounting for already-filled slots
 */
function buildDistributionsFromTOS(tos: any, existingItems: any[]): any[] {
  const distributions: any[] = [];
  
  // Parse TOS distribution or topics
  const tosDistribution = tos.distribution || tos.topics || [];
  
  if (!Array.isArray(tosDistribution) || tosDistribution.length === 0) {
    return distributions;
  }

  // Count existing items by topic+bloom
  const existingCounts: Record<string, number> = {};
  for (const item of existingItems) {
    const topic = item.topic?.toLowerCase() || '';
    const bloom = item.bloom_level?.toLowerCase() || '';
    const key = `${topic}::${bloom}`;
    existingCounts[key] = (existingCounts[key] || 0) + 1;
  }

  for (const dist of tosDistribution) {
    const topic = dist.topic || dist.topic_name || '';
    if (!topic) continue;

    const counts: any = {
      remembering: 0,
      understanding: 0,
      applying: 0,
      analyzing: 0,
      evaluating: 0,
      creating: 0,
      difficulty: { easy: 1, average: 2, difficult: 1 }
    };

    // Get required counts from TOS
    const bloomLevels = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
    
    for (const bloom of bloomLevels) {
      const required = dist[`${bloom}_items`] || dist.counts?.[bloom] || 0;
      const existingKey = `${topic.toLowerCase()}::${bloom}`;
      const existing = existingCounts[existingKey] || 0;
      const gap = Math.max(0, required - existing);
      counts[bloom] = gap;
    }

    // Only add if there are gaps to fill
    const totalGap = bloomLevels.reduce((sum, b) => sum + counts[b], 0);
    if (totalGap > 0) {
      distributions.push({ topic, counts });
    }
  }

  return distributions;
}
