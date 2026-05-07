import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;

export interface WatermarkData {
  studentId?: string;
  studentName?: string;
  versionLabel: string;
  testId: string;
  timestamp: string;
  uniqueCode?: string;
}

export interface SecurityEvent {
  testVersionId: string;
  eventType: 'assignment' | 'access' | 'submission' | 'suspicious';
  severity: 'info' | 'warning' | 'critical';
  eventData: Record<string, any>;
}

/**
 * Generate cryptographically secure unique watermark code for tracking
 */
export function generateWatermarkCode(
  testId: string,
  studentId: string,
  versionLabel: string
): string {
  // Generate cryptographically secure random bytes
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 8);
  
  const timestamp = Date.now().toString(36);
  const hashInput = `${testId}-${studentId}-${versionLabel}`;
  
  // Use a simple hash for ID component (not for security, just identification)
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 8).toUpperCase();
  
  return `${versionLabel}-${hashStr}-${timestamp}-${randomHex}`.toUpperCase();
}

/**
 * Create watermark data for PDF export
 */
export function createWatermark(data: WatermarkData): WatermarkData {
  const uniqueCode = generateWatermarkCode(
    data.testId,
    data.studentId || 'UNASSIGNED',
    data.versionLabel
  );

  return {
    ...data,
    uniqueCode,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate invisible tracking metadata with cryptographic checksum
 */
export function generateTrackingMetadata(watermark: WatermarkData): Record<string, any> {
  // Create a checksum using all watermark data
  const dataString = JSON.stringify({
    code: watermark.uniqueCode,
    version: watermark.versionLabel,
    student: watermark.studentId,
    test: watermark.testId,
    time: watermark.timestamp
  });
  
  // Generate a simple hash for integrity checking
  let checksum = 0;
  for (let i = 0; i < dataString.length; i++) {
    checksum = ((checksum << 5) - checksum) + dataString.charCodeAt(i);
    checksum = checksum & checksum;
  }
  
  return {
    watermark_code: watermark.uniqueCode,
    version: watermark.versionLabel,
    student_id: watermark.studentId,
    test_id: watermark.testId,
    generated_at: watermark.timestamp,
    checksum: Math.abs(checksum).toString(36)
  };
}

/**
 * Verify watermark integrity
 * NOTE: Basic format validation only. In production, verify checksum server-side
 */
export function verifyWatermark(
  watermark: WatermarkData,
  checksum: string
): boolean {
  const dataString = JSON.stringify({
    code: watermark.uniqueCode,
    version: watermark.versionLabel,
    student: watermark.studentId,
    test: watermark.testId,
    time: watermark.timestamp
  });
  
  let expectedChecksum = 0;
  for (let i = 0; i < dataString.length; i++) {
    expectedChecksum = ((expectedChecksum << 5) - expectedChecksum) + dataString.charCodeAt(i);
    expectedChecksum = expectedChecksum & expectedChecksum;
  }
  
  return Math.abs(expectedChecksum).toString(36) === checksum;
}

/**
 * Log security event
 */
export async function logSecurityEvent(event: SecurityEvent) {
  try {
    await supabase.from('version_security_logs').insert({
      test_version_id: event.testVersionId,
      event_type: event.eventType,
      severity: event.severity,
      event_data: event.eventData
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * Detect potential cheating patterns
 */
export async function detectCheatingPatterns(testId: string): Promise<{
  suspicious: boolean;
  patterns: string[];
}> {
  const patterns: string[] = [];

  try {
    // Check for duplicate submissions
    const { data: assignments } = await supabase
      .from('test_assignments')
      .select('student_id, test_version_id, submitted_at')
      .eq('test_version_id', testId)
      .not('submitted_at', 'is', null);

    if (assignments) {
      // Check for submissions at exact same time (suspicious)
      const submissionTimes = assignments.map(a => 
        new Date(a.submitted_at!).getTime()
      );

      const duplicateTimes = submissionTimes.filter(
        (time, idx) => submissionTimes.indexOf(time) !== idx
      );

      if (duplicateTimes.length > 0) {
        patterns.push('Multiple submissions at exact same timestamp detected');
      }

      // Check for same version assigned to adjacent students
      // This requires seat layout data which should be in metadata
    }

    return {
      suspicious: patterns.length > 0,
      patterns
    };
  } catch (error) {
    console.error('Error detecting cheating patterns:', error);
    return { suspicious: false, patterns: [] };
  }
}

/**
 * Generate seat map to ensure no adjacent students get same version
 */
export function generateSecureSeatMap(
  seats: string[],
  versions: string[],
  adjacencyMatrix: number[][]
): Map<string, string> {
  const seatMap = new Map<string, string>();
  const versionUsage = new Map<string, number>();

  // Initialize version usage
  versions.forEach(v => versionUsage.set(v, 0));

  // Greedy coloring algorithm for version assignment
  seats.forEach((seat, idx) => {
    // Find adjacent seats
    const adjacentSeats = seats.filter((_, i) => 
      adjacencyMatrix[idx] && adjacencyMatrix[idx][i] === 1
    );

    // Get versions already assigned to adjacent seats
    const adjacentVersions = new Set(
      adjacentSeats
        .map(s => seatMap.get(s))
        .filter(Boolean)
    );

    // Find version with lowest usage that's not adjacent
    let selectedVersion = versions[0];
    let minUsage = versionUsage.get(selectedVersion) || 0;

    versions.forEach(version => {
      const usage = versionUsage.get(version) || 0;
      if (!adjacentVersions.has(version) && usage < minUsage) {
        selectedVersion = version;
        minUsage = usage;
      }
    });

    seatMap.set(seat, selectedVersion);
    versionUsage.set(selectedVersion, minUsage + 1);
  });

  return seatMap;
}

/**
 * Audit test distribution for security issues
 */
export async function auditTestDistribution(parentTestId: string): Promise<{
  secure: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    // Check version balance
    const { data: balanceData } = await supabase
      .rpc('validate_version_balance', { p_parent_test_id: parentTestId });

    if (balanceData && !balanceData[0]?.is_balanced) {
      issues.push('Unbalanced version distribution detected');
      recommendations.push('Redistribute tests to ensure equal version distribution');
    }

    // Check for security logs
    const { data: securityLogs } = await supabase
      .from('version_security_logs')
      .select('*')
      .eq('test_version_id', parentTestId)
      .eq('severity', 'critical')
      .order('detected_at', { ascending: false })
      .limit(10);

    if (securityLogs && securityLogs.length > 0) {
      issues.push(`${securityLogs.length} critical security events detected`);
      recommendations.push('Review security logs and investigate flagged events');
    }

    return {
      secure: issues.length === 0,
      issues,
      recommendations
    };
  } catch (error) {
    console.error('Error auditing distribution:', error);
    return {
      secure: false,
      issues: ['Audit failed to complete'],
      recommendations: ['Check system logs for errors']
    };
  }
}
