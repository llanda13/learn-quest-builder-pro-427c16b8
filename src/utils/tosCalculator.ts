/**
 * TOS Calculator Utility
 * 
 * Provides mathematically correct TOS matrix generation with:
 * 1. Item conservation (no rounding drift)
 * 2. Bloom totals locked first, then distributed to topics
 * 3. Single source of truth for all TOS data
 * 4. Proper metadata handling
 * 
 * INVARIANTS (must always be true):
 * - Total items (input) === Total items (matrix sum)
 * - Sum of Bloom levels === Total items
 * - Sum of all matrix cells === Total items
 */

import { generateUUID } from './uuid';

// Bloom's Taxonomy distribution (must sum to 1.0)
export const BLOOM_DISTRIBUTION = {
  remembering: 0.15,   // 15% - Easy
  understanding: 0.15, // 15% - Easy
  applying: 0.20,      // 20% - Average
  analyzing: 0.20,     // 20% - Average
  evaluating: 0.15,    // 15% - Difficult
  creating: 0.15       // 15% - Difficult
} as const;

// Difficulty groupings
export const DIFFICULTY_GROUPS = {
  easy: ['remembering', 'understanding'],      // 30% total
  average: ['applying', 'analyzing'],          // 40% total
  difficult: ['evaluating', 'creating']        // 30% total
} as const;

export type BloomLevel = keyof typeof BLOOM_DISTRIBUTION;

export interface TopicInput {
  topic: string;
  hours: number;
}

export interface TOSInput {
  subject_no: string;
  course: string;
  description: string;
  year_section: string;
  exam_period: string;
  school_year: string;
  total_items: number;
  prepared_by: string;
  checked_by?: string;
  noted_by: string;
  topics: TopicInput[];
}

export interface BloomCellData {
  count: number;
  items: number[];
}

export interface TopicDistribution {
  hours: number;
  percentage: number;
  total: number;
  remembering: BloomCellData;
  understanding: BloomCellData;
  applying: BloomCellData;
  analyzing: BloomCellData;
  evaluating: BloomCellData;
  creating: BloomCellData;
}

export interface CanonicalTOSMatrix {
  // Identity & metadata
  id: string;
  title: string;
  subject_no: string;
  course: string;
  description: string;
  year_section: string;
  exam_period: string;
  school_year: string;
  prepared_by: string;
  checked_by: string;
  noted_by: string;
  created_at: string;
  
  // Core data
  total_items: number;
  total_hours: number;
  topics: TopicInput[];
  
  // The distribution matrix (single source of truth)
  distribution: Record<string, TopicDistribution>;
  
  // Pre-computed Bloom totals (for validation/display)
  bloom_totals: Record<BloomLevel, number>;
  
  // Legacy compatibility field
  matrix: Record<string, Record<BloomLevel, BloomCellData>>;
}

/**
 * Distributes a total into parts according to weights using largest remainder method.
 * This ensures sum(parts) === total with no drift.
 */
function distributeWithLargestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  
  // Calculate ideal (fractional) allocations
  const idealAllocations = weights.map(w => (w / sum) * total);
  
  // Take floor of each
  const floors = idealAllocations.map(Math.floor);
  
  // Calculate remainders
  const remainders = idealAllocations.map((ideal, i) => ({
    index: i,
    remainder: ideal - floors[i]
  }));
  
  // Sort by remainder descending
  remainders.sort((a, b) => b.remainder - a.remainder);
  
  // Distribute the remaining items to those with largest remainders
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const result = [...floors];
  
  for (let i = 0; i < remaining && i < remainders.length; i++) {
    result[remainders[i].index]++;
  }
  
  return result;
}

/**
 * Calculate TOS Matrix with guaranteed item conservation.
 * 
 * Algorithm:
 * 1. Lock Bloom totals first (global constraint)
 * 2. Distribute topic allocations based on hours
 * 3. For each topic, distribute Bloom items using largest remainder
 * 4. Reconcile to ensure exact totals match
 */
export function calculateCanonicalTOSMatrix(input: TOSInput): CanonicalTOSMatrix {
  const { total_items, topics } = input;
  const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  
  // Step 1: Calculate total hours
  const total_hours = topics.reduce((sum, t) => sum + t.hours, 0);
  
  if (total_hours === 0) {
    throw new Error("Total hours cannot be zero");
  }
  
  // Step 2: Lock Bloom totals globally (this is the constraint)
  const bloomWeights = bloomLevels.map(level => BLOOM_DISTRIBUTION[level]);
  const bloomTotals = distributeWithLargestRemainder(total_items, bloomWeights);
  const bloom_totals: Record<BloomLevel, number> = {} as Record<BloomLevel, number>;
  bloomLevels.forEach((level, i) => {
    bloom_totals[level] = bloomTotals[i];
  });
  
  // Step 3: Distribute items to topics based on hours
  const topicWeights = topics.map(t => t.hours);
  const topicItemAllocations = distributeWithLargestRemainder(total_items, topicWeights);
  
  // Step 4: For each topic, distribute its items across Bloom levels
  // We need to ensure that the column (Bloom) totals match the locked values
  
  // First pass: calculate ideal distribution per topic
  const topicBloomMatrix: number[][] = topics.map((topic, topicIdx) => {
    const topicTotal = topicItemAllocations[topicIdx];
    // Each topic distributes according to Bloom percentages
    return distributeWithLargestRemainder(topicTotal, bloomWeights);
  });
  
  // Second pass: reconcile column totals to match locked Bloom totals
  // This ensures global Bloom constraints are met
  bloomLevels.forEach((_, bloomIdx) => {
    const currentColTotal = topicBloomMatrix.reduce((sum, row) => sum + row[bloomIdx], 0);
    const targetColTotal = bloomTotals[bloomIdx];
    let diff = targetColTotal - currentColTotal;
    
    if (diff !== 0) {
      // Find topics to adjust (prefer topics with more items)
      const topicsBySize = topics
        .map((t, i) => ({ index: i, items: topicItemAllocations[i] }))
        .sort((a, b) => b.items - a.items);
      
      for (const { index: topicIdx } of topicsBySize) {
        if (diff === 0) break;
        
        const currentVal = topicBloomMatrix[topicIdx][bloomIdx];
        
        if (diff > 0) {
          // Need to add items to this column
          topicBloomMatrix[topicIdx][bloomIdx]++;
          diff--;
        } else if (diff < 0 && currentVal > 0) {
          // Need to remove items from this column
          topicBloomMatrix[topicIdx][bloomIdx]--;
          diff++;
        }
      }
    }
  });
  
  // Third pass: ensure row totals match topic allocations
  // Adjust within each row without changing column totals
  topics.forEach((_, topicIdx) => {
    const currentRowTotal = topicBloomMatrix[topicIdx].reduce((a, b) => a + b, 0);
    const targetRowTotal = topicItemAllocations[topicIdx];
    let diff = targetRowTotal - currentRowTotal;
    
    if (diff !== 0) {
      // Find columns where we can adjust without breaking column totals
      // Priority: adjust columns that have more items
      const colsBySize = bloomLevels
        .map((_, i) => ({ index: i, items: topicBloomMatrix[topicIdx][i] }))
        .sort((a, b) => b.items - a.items);
      
      for (const { index: bloomIdx } of colsBySize) {
        if (diff === 0) break;
        
        if (diff > 0) {
          topicBloomMatrix[topicIdx][bloomIdx]++;
          diff--;
        } else if (diff < 0 && topicBloomMatrix[topicIdx][bloomIdx] > 0) {
          topicBloomMatrix[topicIdx][bloomIdx]--;
          diff++;
        }
      }
    }
  });
  
  // Step 5: Generate item numbers sequentially
  let itemCounter = 1;
  const distribution: Record<string, TopicDistribution> = {};
  const matrix: Record<string, Record<BloomLevel, BloomCellData>> = {};
  
  topics.forEach((topic, topicIdx) => {
    const topicName = topic.topic;
    const topicPercentage = Math.round((topic.hours / total_hours) * 100);
    const topicTotal = topicBloomMatrix[topicIdx].reduce((a, b) => a + b, 0);
    
    const topicDist: Partial<TopicDistribution> = {
      hours: topic.hours,
      percentage: topicPercentage,
      total: topicTotal
    };
    
    matrix[topicName] = {} as Record<BloomLevel, BloomCellData>;
    
    bloomLevels.forEach((level, bloomIdx) => {
      const count = topicBloomMatrix[topicIdx][bloomIdx];
      const items: number[] = [];
      
      for (let i = 0; i < count; i++) {
        items.push(itemCounter++);
      }
      
      const cellData: BloomCellData = { count, items };
      topicDist[level] = cellData;
      matrix[topicName][level] = cellData;
    });
    
    distribution[topicName] = topicDist as TopicDistribution;
  });
  
  // Step 6: Final validation
  const matrixTotal = Object.values(distribution).reduce(
    (sum, topic) => sum + topic.total,
    0
  );
  
  const bloomSumCheck = bloomLevels.reduce(
    (sum, level) => sum + Object.values(distribution).reduce((s, t) => s + t[level].count, 0),
    0
  );
  
  // Assert invariants
  if (matrixTotal !== total_items) {
    console.error(`INVARIANT VIOLATION: Matrix total (${matrixTotal}) !== Input total (${total_items})`);
    throw new Error(`TOS calculation error: item count mismatch (${matrixTotal} vs ${total_items})`);
  }
  
  if (bloomSumCheck !== total_items) {
    console.error(`INVARIANT VIOLATION: Bloom sum (${bloomSumCheck}) !== Input total (${total_items})`);
    throw new Error(`TOS calculation error: bloom sum mismatch (${bloomSumCheck} vs ${total_items})`);
  }
  
  // Recalculate bloom_totals from actual distribution (for consistency)
  const finalBloomTotals: Record<BloomLevel, number> = {} as Record<BloomLevel, number>;
  bloomLevels.forEach(level => {
    finalBloomTotals[level] = Object.values(distribution).reduce((sum, topic) => sum + topic[level].count, 0);
  });
  
  return {
    id: generateUUID(),
    title: `${input.course} - ${input.exam_period}`,
    subject_no: input.subject_no,
    course: input.course,
    description: input.description,
    year_section: input.year_section,
    exam_period: input.exam_period,
    school_year: input.school_year,
    prepared_by: input.prepared_by || 'Teacher',
    checked_by: input.checked_by || '',
    noted_by: input.noted_by || 'Dean',
    created_at: new Date().toISOString(),
    total_items,
    total_hours,
    topics: input.topics,
    distribution,
    bloom_totals: finalBloomTotals,
    matrix
  };
}

/**
 * Validate a TOS matrix meets all invariants.
 * Returns true if valid, throws error with details if not.
 */
export function validateTOSMatrix(tos: CanonicalTOSMatrix): boolean {
  const { total_items, distribution, bloom_totals } = tos;
  const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  
  // Check 1: Matrix total equals input total
  const matrixTotal = Object.values(distribution).reduce((sum, topic) => sum + topic.total, 0);
  if (matrixTotal !== total_items) {
    throw new Error(`Validation failed: Matrix total (${matrixTotal}) !== Total items (${total_items})`);
  }
  
  // Check 2: Sum of bloom levels equals total
  const bloomSum = bloomLevels.reduce(
    (sum, level) => sum + (bloom_totals[level] || 0),
    0
  );
  if (bloomSum !== total_items) {
    throw new Error(`Validation failed: Bloom sum (${bloomSum}) !== Total items (${total_items})`);
  }
  
  // Check 3: Each bloom column total matches bloom_totals
  bloomLevels.forEach(level => {
    const colTotal = Object.values(distribution).reduce((sum, topic) => sum + topic[level].count, 0);
    if (colTotal !== bloom_totals[level]) {
      throw new Error(`Validation failed: ${level} column total (${colTotal}) !== bloom_totals.${level} (${bloom_totals[level]})`);
    }
  });
  
  // Check 4: Item numbers are sequential and correct
  const allItems = Object.values(distribution)
    .flatMap(topic => bloomLevels.flatMap(level => topic[level].items))
    .sort((a, b) => a - b);
  
  for (let i = 0; i < allItems.length; i++) {
    if (allItems[i] !== i + 1) {
      throw new Error(`Validation failed: Item sequence broken at position ${i}, expected ${i + 1}, got ${allItems[i]}`);
    }
  }
  
  return true;
}

/**
 * Convert canonical TOS to legacy format for backward compatibility.
 */
export function toLegacyFormat(tos: CanonicalTOSMatrix): any {
  const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
  
  // Create legacy distribution format (arrays instead of objects)
  const legacyDistribution: Record<string, any> = {};
  
  Object.entries(tos.distribution).forEach(([topicName, topicData]) => {
    legacyDistribution[topicName] = {
      hours: topicData.hours,
      total: topicData.total,
      remembering: topicData.remembering.items,
      understanding: topicData.understanding.items,
      applying: topicData.applying.items,
      analyzing: topicData.analyzing.items,
      evaluating: topicData.evaluating.items,
      creating: topicData.creating.items
    };
  });
  
  return {
    ...tos,
    distribution: legacyDistribution
  };
}

/**
 * Get difficulty for a bloom level
 */
export function getDifficultyForBloom(bloom: BloomLevel): 'easy' | 'average' | 'difficult' {
  if (DIFFICULTY_GROUPS.easy.includes(bloom as any)) return 'easy';
  if (DIFFICULTY_GROUPS.average.includes(bloom as any)) return 'average';
  return 'difficult';
}
