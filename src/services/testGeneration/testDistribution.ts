import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import seedrandom from 'seedrandom';

export type DistributionStrategy = 'random' | 'sequential' | 'balanced' | 'avoid-adjacent';

export interface StudentAssignment {
  student_id: string;
  student_name: string;
  test_version_id: string;
  version_label: string;
  seat_number?: string;
  assigned_at: Date;
}

export interface DistributionConfig {
  strategy: DistributionStrategy;
  parentTestId: string;
  versionIds: string[];
  students: { id: string; name: string; seatNumber?: string }[];
  seed?: string;
}

export interface DistributionResult {
  assignments: StudentAssignment[];
  balanceMetrics: {
    versionCounts: Record<string, number>;
    isBalanced: boolean;
    maxDiff: number;
  };
  logId: string;
}

/**
 * Random distribution with optional seed
 */
function randomDistribution(
  students: any[],
  versionIds: string[],
  versionLabels: string[],
  seed?: string
): StudentAssignment[] {
  const rng = seed ? seedrandom(seed) : Math.random;
  const assignments: StudentAssignment[] = [];
  
  students.forEach(student => {
    const randomIndex = Math.floor(rng() * versionIds.length);
    assignments.push({
      student_id: student.id,
      student_name: student.name,
      test_version_id: versionIds[randomIndex],
      version_label: versionLabels[randomIndex],
      seat_number: student.seatNumber,
      assigned_at: new Date()
    });
  });
  
  return assignments;
}

/**
 * Sequential distribution (A, B, C, A, B, C, ...)
 */
function sequentialDistribution(
  students: any[],
  versionIds: string[],
  versionLabels: string[]
): StudentAssignment[] {
  const assignments: StudentAssignment[] = [];
  
  students.forEach((student, index) => {
    const versionIndex = index % versionIds.length;
    assignments.push({
      student_id: student.id,
      student_name: student.name,
      test_version_id: versionIds[versionIndex],
      version_label: versionLabels[versionIndex],
      seat_number: student.seatNumber,
      assigned_at: new Date()
    });
  });
  
  return assignments;
}

/**
 * Balanced distribution (ensures equal distribution across versions)
 */
function balancedDistribution(
  students: any[],
  versionIds: string[],
  versionLabels: string[],
  seed?: string
): StudentAssignment[] {
  const rng = seed ? seedrandom(seed) : Math.random;
  const assignments: StudentAssignment[] = [];
  
  // Shuffle students first
  const shuffledStudents = [...students].sort(() => rng() - 0.5);
  
  // Distribute evenly
  const baseCount = Math.floor(shuffledStudents.length / versionIds.length);
  const remainder = shuffledStudents.length % versionIds.length;
  
  let studentIndex = 0;
  versionIds.forEach((versionId, vIndex) => {
    const count = baseCount + (vIndex < remainder ? 1 : 0);
    
    for (let i = 0; i < count && studentIndex < shuffledStudents.length; i++) {
      const student = shuffledStudents[studentIndex++];
      assignments.push({
        student_id: student.id,
        student_name: student.name,
        test_version_id: versionId,
        version_label: versionLabels[vIndex],
        seat_number: student.seatNumber,
        assigned_at: new Date()
      });
    }
  });
  
  return assignments;
}

/**
 * Avoid adjacent distribution (students in adjacent seats get different versions)
 */
function avoidAdjacentDistribution(
  students: any[],
  versionIds: string[],
  versionLabels: string[]
): StudentAssignment[] {
  const assignments: StudentAssignment[] = [];
  
  // Sort students by seat number if available
  const sortedStudents = [...students].sort((a, b) => {
    if (!a.seatNumber || !b.seatNumber) return 0;
    return a.seatNumber.localeCompare(b.seatNumber);
  });
  
  sortedStudents.forEach((student, index) => {
    // Alternate versions to avoid adjacent duplicates
    const versionIndex = index % Math.min(versionIds.length, 2);
    assignments.push({
      student_id: student.id,
      student_name: student.name,
      test_version_id: versionIds[versionIndex],
      version_label: versionLabels[versionIndex],
      seat_number: student.seatNumber,
      assigned_at: new Date()
    });
  });
  
  return assignments;
}

/**
 * Calculate balance metrics for assignments
 */
function calculateBalanceMetrics(
  assignments: StudentAssignment[]
): {
  versionCounts: Record<string, number>;
  isBalanced: boolean;
  maxDiff: number;
} {
  const versionCounts: Record<string, number> = {};
  
  assignments.forEach(a => {
    versionCounts[a.version_label] = (versionCounts[a.version_label] || 0) + 1;
  });
  
  const counts = Object.values(versionCounts);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const maxDiff = maxCount - minCount;
  
  return {
    versionCounts,
    isBalanced: maxDiff <= 2,
    maxDiff
  };
}

/**
 * Main distribution function
 */
export async function distributeTestVersions(
  config: DistributionConfig
): Promise<DistributionResult> {
  // Fetch version data
  const { data: versions, error: versionsError } = await supabase
    .from('generated_tests')
    .select('id, version_label, version_number')
    .in('id', config.versionIds)
    .order('version_number');
  
  if (versionsError) throw versionsError;
  if (!versions || versions.length === 0) {
    throw new Error('No test versions found');
  }
  
  const versionIds = versions.map(v => v.id);
  const versionLabels = versions.map(v => v.version_label || 'A');
  
  // Execute distribution strategy
  let assignments: StudentAssignment[] = [];
  
  switch (config.strategy) {
    case 'random':
      assignments = randomDistribution(config.students, versionIds, versionLabels, config.seed);
      break;
    case 'sequential':
      assignments = sequentialDistribution(config.students, versionIds, versionLabels);
      break;
    case 'balanced':
      assignments = balancedDistribution(config.students, versionIds, versionLabels, config.seed);
      break;
    case 'avoid-adjacent':
      assignments = avoidAdjacentDistribution(config.students, versionIds, versionLabels);
      break;
    default:
      throw new Error(`Unknown distribution strategy: ${config.strategy}`);
  }
  
  // Calculate balance metrics
  const balanceMetrics = calculateBalanceMetrics(assignments);
  
  // Save assignments to database
  const { data: user } = await supabase.auth.getUser();
  const userId = user?.user?.id;
  
  const assignmentRecords = assignments.map(a => ({
    student_id: a.student_id,
    student_name: a.student_name,
    test_version_id: a.test_version_id,
    seat_number: a.seat_number,
    assigned_by: userId,
    assigned_at: a.assigned_at.toISOString(),
    status: 'assigned',
    metadata: { version_label: a.version_label }
  }));
  
  const { error: assignError } = await supabase
    .from('test_assignments')
    .insert(assignmentRecords);
  
  if (assignError) throw assignError;
  
  // Log distribution
  const { data: logData, error: logError } = await supabase
    .from('test_distribution_logs')
    .insert({
      parent_test_id: config.parentTestId,
      distribution_strategy: config.strategy,
      total_versions: versionIds.length,
      total_students: config.students.length,
      distributed_by: userId,
      settings: {
        seed: config.seed,
        balance_metrics: balanceMetrics
      }
    })
    .select('id')
    .single();
  
  if (logError) throw logError;
  
  return {
    assignments,
    balanceMetrics,
    logId: logData.id
  };
}
