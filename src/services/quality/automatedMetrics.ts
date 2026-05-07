import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { metricsCollector } from '@/services/monitoring/metricsCollector';

/**
 * Automated metrics collection service
 * Runs periodic checks and collects system metrics
 */

export class AutomatedMetrics {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start automated metrics collection
   * @param intervalMinutes How often to collect metrics (default: 5 minutes)
   */
  start(intervalMinutes: number = 5) {
    if (this.intervalId) {
      console.warn('Automated metrics already running');
      return;
    }

    console.log(`Starting automated metrics collection every ${intervalMinutes} minutes`);
    
    // Run immediately
    this.collectMetrics();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automated metrics collection
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Stopped automated metrics collection');
    }
  }

  /**
   * Collect all system metrics
   */
  private async collectMetrics() {
    console.log('Collecting system metrics...');

    try {
      await Promise.all([
        this.collectQuestionMetrics(),
        this.collectValidationMetrics(),
        this.collectUserActivityMetrics(),
        this.collectPerformanceMetrics(),
        this.collectSystemHealthMetrics()
      ]);

      console.log('Metrics collection completed');
    } catch (error) {
      console.error('Error collecting metrics:', error);
      await metricsCollector.trackError(
        'metrics_collection_error',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Collect question-related metrics
   */
  private async collectQuestionMetrics() {
    try {
      const { data: questions } = await supabase
        .from('questions')
        .select('approved, quality_score, classification_confidence, needs_review');

      if (!questions) return;

      const totalQuestions = questions.length;
      const approvedQuestions = questions.filter(q => q.approved).length;
      const avgQuality = questions.reduce((sum, q) => sum + (q.quality_score || 0), 0) / totalQuestions;
      const avgConfidence = questions.reduce((sum, q) => sum + (q.classification_confidence || 0), 0) / totalQuestions;
      const needsReview = questions.filter(q => q.needs_review).length;

      await Promise.all([
        metricsCollector.recordQualityMetric({
          entity_type: 'question_bank',
          characteristic: 'Functional Completeness',
          metric_name: 'total_questions',
          value: totalQuestions,
          unit: 'count',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'question_bank',
          characteristic: 'Functional Correctness',
          metric_name: 'approval_rate',
          value: approvedQuestions / totalQuestions,
          unit: 'ratio',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'question_bank',
          characteristic: 'Functional Correctness',
          metric_name: 'avg_quality_score',
          value: avgQuality,
          unit: 'score',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'ai_classification',
          characteristic: 'Functional Correctness',
          metric_name: 'avg_confidence',
          value: avgConfidence,
          unit: 'score',
          automated: true
        }),
        metricsCollector.recordSystemMetric({
          metric_name: 'questions_needing_review',
          metric_category: 'quality',
          metric_value: needsReview,
          metric_unit: 'count'
        })
      ]);
    } catch (error) {
      console.error('Error collecting question metrics:', error);
    }
  }

  /**
   * Collect validation-related metrics
   */
  private async collectValidationMetrics() {
    try {
      const { data: validations } = await supabase
        .from('classification_validations')
        .select('validation_confidence, created_at');

      if (!validations || validations.length === 0) return;

      const totalValidations = validations.length;
      const avgValidationConfidence = validations.reduce((sum, v) => sum + (v.validation_confidence || 0), 0) / totalValidations;

      // Count validations in last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const recentValidations = validations.filter(v => new Date(v.created_at) > yesterday).length;

      await Promise.all([
        metricsCollector.recordQualityMetric({
          entity_type: 'validation_workflow',
          characteristic: 'Functional Correctness',
          metric_name: 'total_validations',
          value: totalValidations,
          unit: 'count',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'validation_workflow',
          characteristic: 'Functional Correctness',
          metric_name: 'avg_validation_confidence',
          value: avgValidationConfidence,
          unit: 'score',
          automated: true
        }),
        metricsCollector.recordSystemMetric({
          metric_name: 'daily_validations',
          metric_category: 'usage',
          metric_value: recentValidations,
          metric_unit: 'count',
          aggregation_period: 'daily'
        })
      ]);
    } catch (error) {
      console.error('Error collecting validation metrics:', error);
    }
  }

  /**
   * Collect user activity metrics
   */
  private async collectUserActivityMetrics() {
    try {
      const { data: activities } = await supabase
        .from('activity_log')
        .select('user_id, action, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!activities) return;

      const uniqueUsers = new Set(activities.map(a => a.user_id)).size;
      const avgActionsPerUser = activities.length / Math.max(uniqueUsers, 1);

      // Count actions in last hour
      const lastHour = new Date();
      lastHour.setHours(lastHour.getHours() - 1);
      const recentActions = activities.filter(a => new Date(a.created_at) > lastHour).length;

      await Promise.all([
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Appropriateness Recognizability',
          metric_name: 'active_users',
          value: uniqueUsers,
          unit: 'count',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Operability',
          metric_name: 'avg_actions_per_user',
          value: avgActionsPerUser,
          unit: 'count',
          automated: true
        }),
        metricsCollector.recordSystemMetric({
          metric_name: 'hourly_actions',
          metric_category: 'usage',
          metric_value: recentActions,
          metric_unit: 'count',
          aggregation_period: 'hourly'
        })
      ]);
    } catch (error) {
      console.error('Error collecting user activity metrics:', error);
    }
  }

  /**
   * Collect performance metrics from recent benchmarks
   */
  private async collectPerformanceMetrics() {
    try {
      const { data: benchmarks } = await supabase
        .from('performance_benchmarks')
        .select('*')
        .order('measured_at', { ascending: false })
        .limit(100);

      if (!benchmarks || benchmarks.length === 0) return;

      const avgResponseTime = benchmarks.reduce((sum, b) => sum + b.average_response_time, 0) / benchmarks.length;
      const avgThroughput = benchmarks.reduce((sum, b) => sum + b.throughput, 0) / benchmarks.length;
      const avgErrorRate = benchmarks.reduce((sum, b) => sum + b.error_rate, 0) / benchmarks.length;

      await Promise.all([
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Time Behaviour',
          metric_name: 'avg_response_time',
          value: avgResponseTime,
          unit: 'ms',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Resource Utilization',
          metric_name: 'throughput',
          value: avgThroughput,
          unit: 'req/s',
          automated: true
        }),
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Maturity',
          metric_name: 'error_rate',
          value: avgErrorRate,
          unit: 'ratio',
          automated: true
        })
      ]);
    } catch (error) {
      console.error('Error collecting performance metrics:', error);
    }
  }

  /**
   * Collect system health metrics
   */
  private async collectSystemHealthMetrics() {
    try {
      // Simple health check: can we query the database?
      const startTime = Date.now();
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const responseTime = Date.now() - startTime;

      const isHealthy = !error && responseTime < 1000;

      await Promise.all([
        metricsCollector.recordQualityMetric({
          entity_type: 'system',
          characteristic: 'Availability',
          metric_name: 'health_check',
          value: isHealthy ? 1 : 0,
          unit: 'boolean',
          automated: true
        }),
        metricsCollector.recordSystemMetric({
          metric_name: 'health_check_time',
          metric_category: 'performance',
          metric_value: responseTime,
          metric_unit: 'ms'
        })
      ]);

      if (!isHealthy) {
        await metricsCollector.trackError(
          'health_check_failed',
          error?.message || 'Health check timeout',
          { responseTime }
        );
      }
    } catch (error) {
      console.error('Error collecting health metrics:', error);
    }
  }

  /**
   * Track a specific API call
   */
  async trackApiCall(
    endpoint: string,
    startTime: number,
    success: boolean,
    statusCode: number
  ) {
    const duration = Date.now() - startTime;
    
    await metricsCollector.trackApiResponseTime(endpoint, duration, statusCode);

    if (!success) {
      await metricsCollector.trackError(
        'api_call_failed',
        `Failed API call to ${endpoint}`,
        { statusCode, duration }
      );
    }
  }
}

export const automatedMetrics = new AutomatedMetrics();
