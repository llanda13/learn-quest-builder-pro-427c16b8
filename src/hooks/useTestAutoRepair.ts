import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { repairFormatAwareTest } from '@/services/ai/formatAwareTestGeneration';

interface RepairResult {
  repaired: boolean;
  originalCount: number;
  repairedCount: number;
  replacedQuestionNumbers: number[];
}

export function useTestAutoRepair(testId: string | undefined) {
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const { toast } = useToast();

  const checkAndRepair = useCallback(async (test: any): Promise<any> => {
    if (!test || !test.tos_id || !testId) return test;

    setIsRepairing(true);
    try {
      const currentCount = Array.isArray(test.items) ? test.items.length : 0;
      const repair = await repairFormatAwareTest({
        id: testId,
        format_id: test.format_id,
        tos_id: test.tos_id,
        items: test.items,
        answer_key: test.answer_key
      });

      if (!repair.repaired) return test;

      const result: RepairResult = {
        repaired: true,
        originalCount: currentCount,
        repairedCount: repair.items.length,
        replacedQuestionNumbers: repair.replacedQuestionNumbers
      };
      setRepairResult(result);
      toast({
        title: 'Test auto-repaired',
        description: `Validated ${repair.items.length} TOS slots${result.replacedQuestionNumbers.length
          ? `; replaced question(s) ${result.replacedQuestionNumbers.join(', ')}`
          : ''}.`
      });
      return {
        ...test,
        format_id: test.format_id,
        items: repair.items,
        answer_key: repair.answer_key
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected repair error.';
      console.error('Automatic examination repair failed:', error);
      toast({
        title: 'Auto-repair failed',
        description: message,
        variant: 'destructive'
      });
      return test;
    } finally {
      setIsRepairing(false);
    }
  }, [testId, toast]);

  return { checkAndRepair, isRepairing, repairResult };
}
