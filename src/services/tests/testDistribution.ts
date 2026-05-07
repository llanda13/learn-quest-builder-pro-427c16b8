import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;

export interface Student {
  id: string;
  name: string;
  seatNumber?: string;
  metadata?: Record<string, any>;
}

export interface DistributionConfig {
  parentTestId: string;
  students: Student[];
  strategy: 'random' | 'sequential' | 'balanced' | 'avoid_adjacent';
  preventAdjacentSame?: boolean;
  seatLayout?: string[][]; // 2D array representing classroom seating
}

export interface Assignment {
  studentId: string;
  studentName: string;
  testVersionId: string;
  versionLabel: string;
  seatNumber?: string;
}

/**
 * Get all available test versions for distribution
 */
export async function getAvailableVersions(parentTestId: string) {
  const { data, error } = await supabase
    .from('generated_tests')
    .select('id, version_label, version_number')
    .or(`id.eq.${parentTestId},parent_test_id.eq.${parentTestId}`)
    .order('version_number');

  if (error) throw error;
  return data || [];
}

/**
 * Random distribution strategy
 */
function randomDistribution(students: Student[], versions: any[]): Assignment[] {
  const assignments: Assignment[] = [];
  
  students.forEach(student => {
    const randomVersion = versions[Math.floor(Math.random() * versions.length)];
    assignments.push({
      studentId: student.id,
      studentName: student.name,
      testVersionId: randomVersion.id,
      versionLabel: randomVersion.version_label,
      seatNumber: student.seatNumber
    });
  });

  return assignments;
}

/**
 * Sequential distribution strategy (round-robin)
 */
function sequentialDistribution(students: Student[], versions: any[]): Assignment[] {
  const assignments: Assignment[] = [];
  
  students.forEach((student, index) => {
    const version = versions[index % versions.length];
    assignments.push({
      studentId: student.id,
      studentName: student.name,
      testVersionId: version.id,
      versionLabel: version.version_label,
      seatNumber: student.seatNumber
    });
  });

  return assignments;
}

/**
 * Balanced distribution strategy (ensures equal distribution)
 */
function balancedDistribution(students: Student[], versions: any[]): Assignment[] {
  const assignments: Assignment[] = [];
  const versionCounts = new Map<string, number>();
  
  // Initialize counts
  versions.forEach(v => versionCounts.set(v.id, 0));

  // Shuffle students for fairness
  const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

  shuffledStudents.forEach(student => {
    // Find version with lowest count
    let minVersion = versions[0];
    let minCount = versionCounts.get(minVersion.id) || 0;

    versions.forEach(version => {
      const count = versionCounts.get(version.id) || 0;
      if (count < minCount) {
        minCount = count;
        minVersion = version;
      }
    });

    assignments.push({
      studentId: student.id,
      studentName: student.name,
      testVersionId: minVersion.id,
      versionLabel: minVersion.version_label,
      seatNumber: student.seatNumber
    });

    versionCounts.set(minVersion.id, minCount + 1);
  });

  return assignments;
}

/**
 * Avoid adjacent same versions (requires seat layout)
 */
function avoidAdjacentDistribution(
  students: Student[], 
  versions: any[], 
  seatLayout?: string[][]
): Assignment[] {
  if (!seatLayout) {
    return balancedDistribution(students, versions);
  }

  const assignments: Assignment[] = [];
  const seatAssignments = new Map<string, string>(); // seat -> versionId

  // Process each seat
  seatLayout.forEach((row, rowIdx) => {
    row.forEach((seat, colIdx) => {
      const student = students.find(s => s.seatNumber === seat);
      if (!student) return;

      // Get adjacent seats
      const adjacentSeats: string[] = [];
      if (rowIdx > 0) adjacentSeats.push(seatLayout[rowIdx - 1][colIdx]); // above
      if (rowIdx < seatLayout.length - 1) adjacentSeats.push(seatLayout[rowIdx + 1][colIdx]); // below
      if (colIdx > 0) adjacentSeats.push(seatLayout[rowIdx][colIdx - 1]); // left
      if (colIdx < row.length - 1) adjacentSeats.push(seatLayout[rowIdx][colIdx + 1]); // right

      // Get versions already assigned to adjacent seats
      const adjacentVersions = adjacentSeats
        .map(s => seatAssignments.get(s))
        .filter(Boolean);

      // Find a version not used by adjacent seats
      let selectedVersion = versions.find(v => !adjacentVersions.includes(v.id));
      
      // If all versions are used by adjacent, pick randomly
      if (!selectedVersion) {
        selectedVersion = versions[Math.floor(Math.random() * versions.length)];
      }

      seatAssignments.set(seat, selectedVersion.id);
      
      assignments.push({
        studentId: student.id,
        studentName: student.name,
        testVersionId: selectedVersion.id,
        versionLabel: selectedVersion.version_label,
        seatNumber: student.seatNumber
      });
    });
  });

  return assignments;
}

/**
 * Distribute test versions to students
 */
export async function distributeTests(config: DistributionConfig): Promise<{
  success: boolean;
  assignments?: Assignment[];
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get available versions
    const versions = await getAvailableVersions(config.parentTestId);
    
    if (versions.length === 0) {
      throw new Error('No test versions available for distribution');
    }

    if (versions.length === 1) {
      throw new Error('At least 2 test versions required for distribution');
    }

    // Generate assignments based on strategy
    let assignments: Assignment[];
    
    switch (config.strategy) {
      case 'random':
        assignments = randomDistribution(config.students, versions);
        break;
      case 'sequential':
        assignments = sequentialDistribution(config.students, versions);
        break;
      case 'balanced':
        assignments = balancedDistribution(config.students, versions);
        break;
      case 'avoid_adjacent':
        assignments = avoidAdjacentDistribution(config.students, versions, config.seatLayout);
        break;
      default:
        assignments = balancedDistribution(config.students, versions);
    }

    // Save assignments to database
    const assignmentData = assignments.map(a => ({
      student_id: a.studentId,
      student_name: a.studentName,
      test_version_id: a.testVersionId,
      seat_number: a.seatNumber,
      assigned_by: user.id,
      status: 'assigned',
      metadata: {
        version_label: a.versionLabel,
        distribution_strategy: config.strategy
      }
    }));

    const { error: insertError } = await supabase
      .from('test_assignments')
      .insert(assignmentData);

    if (insertError) throw insertError;

    // Log distribution
    await logDistribution(config, assignments, user.id);

    return {
      success: true,
      assignments
    };
  } catch (error) {
    console.error('Distribution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Log distribution for auditing
 */
async function logDistribution(
  config: DistributionConfig,
  assignments: Assignment[],
  userId: string
) {
  const versionCounts = assignments.reduce((acc, a) => {
    acc[a.versionLabel] = (acc[a.versionLabel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  await supabase.from('test_distribution_logs').insert({
    parent_test_id: config.parentTestId,
    distribution_strategy: config.strategy,
    total_versions: new Set(assignments.map(a => a.testVersionId)).size,
    total_students: assignments.length,
    distributed_by: userId,
    settings: {
      prevent_adjacent_same: config.preventAdjacentSame,
      version_distribution: versionCounts
    }
  });
}

/**
 * Get existing assignments for a test
 */
export async function getTestAssignments(parentTestId: string) {
  const { data, error } = await supabase
    .from('test_assignments')
    .select(`
      *,
      generated_tests!inner(parent_test_id, version_label, version_number)
    `)
    .eq('generated_tests.parent_test_id', parentTestId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Validate distribution balance
 */
export async function validateDistributionBalance(parentTestId: string) {
  const { data, error } = await supabase
    .rpc('validate_version_balance', { p_parent_test_id: parentTestId });

  if (error) throw error;
  return data;
}
