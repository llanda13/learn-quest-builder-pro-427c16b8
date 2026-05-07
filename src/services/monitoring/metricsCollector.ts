import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;

export interface SystemMetric {
  metric_name: string;
  metric_category: string;
  metric_value: number;
  metric_unit?: string;
  dimensions?: Record<string, any>;
  aggregation_period?: string;
}

export interface PerformanceMetric {
  operation_name: string;
  min_response_time: number;
  average_response_time: number;
  max_response_time: number;
  error_rate: number;
  throughput: number;
  measurement_period_minutes?: number;
}

export interface QualityMetric {
  entity_type: string;
  entity_id?: string;
  characteristic: string;
  metric_name: string;
  value: number;
  unit?: string;
  measured_by?: string;
  measurement_method?: string;
  automated?: boolean;
}

class MetricsCollector {
  /**
   * Record a system metric (generic metrics for system behavior)
   */
  async recordSystemMetric(metric: SystemMetric): Promise<void> {
    try {
      const { error } = await supabase
        .from('system_metrics')
        .insert({
          metric_name: metric.metric_name,
          metric_category: metric.metric_category,
          metric_value: metric.metric_value,
          metric_unit: metric.metric_unit,
          dimensions: metric.dimensions || {},
          aggregation_period: metric.aggregation_period,
          measured_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to record system metric:', error);
    }
  }

  /**
   * Record performance benchmark data (for operations/services)
   */
  async recordPerformanceBenchmark(metric: PerformanceMetric): Promise<void> {
    try {
      const { error } = await supabase
        .from('performance_benchmarks')
        .insert({
          operation_name: metric.operation_name,
          min_response_time: metric.min_response_time,
          average_response_time: metric.average_response_time,
          max_response_time: metric.max_response_time,
          error_rate: metric.error_rate,
          throughput: metric.throughput,
          measured_at: new Date().toISOString(),
          measurement_period_minutes: metric.measurement_period_minutes || 60
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to record performance benchmark:', error);
    }
  }

  /**
   * Record quality metric (ISO 25010 quality characteristics)
   */
  async recordQualityMetric(metric: QualityMetric): Promise<void> {
    try {
      const { error } = await supabase
        .from('quality_metrics')
        .insert({
          entity_type: metric.entity_type,
          entity_id: metric.entity_id,
          characteristic: metric.characteristic,
          metric_name: metric.metric_name,
          value: metric.value,
          unit: metric.unit,
          measured_by: metric.measured_by,
          measurement_method: metric.measurement_method,
          automated: metric.automated ?? true
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to record quality metric:', error);
    }
  }

  /**
   * Track API response time
   */
  async trackApiResponseTime(
    endpoint: string,
    responseTime: number,
    statusCode: number
  ): Promise<void> {
    await this.recordSystemMetric({
      metric_name: 'api_response_time',
      metric_category: 'performance',
      metric_value: responseTime,
      metric_unit: 'ms',
      dimensions: {
        endpoint,
        statusCode,
        timestamp: new Date().toISOString()
      }
    });

    // Also update performance benchmarks
    const isError = statusCode >= 400;
    await this.recordPerformanceBenchmark({
      operation_name: endpoint,
      min_response_time: responseTime,
      average_response_time: responseTime,
      max_response_time: responseTime,
      error_rate: isError ? 1 : 0,
      throughput: 1
    });
  }

  /**
   * Track classification accuracy
   */
  async trackClassificationAccuracy(accuracy: number): Promise<void> {
    await this.recordQualityMetric({
      entity_type: 'ai_classification',
      characteristic: 'Functional Correctness',
      metric_name: 'classification_accuracy',
      value: accuracy,
      unit: '%',
      automated: true
    });
  }

  /**
   * Track test generation success rate
   */
  async trackTestGenerationSuccess(success: boolean, duration: number): Promise<void> {
    await Promise.all([
      this.recordSystemMetric({
        metric_name: 'test_generation_duration',
        metric_category: 'performance',
        metric_value: duration,
        metric_unit: 'ms'
      }),
      this.recordQualityMetric({
        entity_type: 'test_generation',
        characteristic: 'Functional Completeness',
        metric_name: 'generation_success_rate',
        value: success ? 100 : 0,
        unit: '%',
        automated: true
      })
    ]);
  }

  /**
   * Track user satisfaction rating
   */
  async trackUserSatisfaction(rating: number, feature: string): Promise<void> {
    await this.recordQualityMetric({
      entity_type: feature,
      characteristic: 'User Satisfaction',
      metric_name: 'satisfaction_rating',
      value: rating,
      unit: '/5',
      automated: false
    });
  }

  /**
   * Track system uptime
   */
  async trackUptime(uptimePercentage: number): Promise<void> {
    await this.recordQualityMetric({
      entity_type: 'system',
      characteristic: 'Availability',
      metric_name: 'uptime',
      value: uptimePercentage,
      unit: '%',
      automated: true
    });
  }

  /**
   * Track error occurrence
   */
  async trackError(
    errorType: string,
    errorMessage: string,
    context?: Record<string, any>
  ): Promise<void> {
    await this.recordSystemMetric({
      metric_name: 'error_occurrence',
      metric_category: 'reliability',
      metric_value: 1,
      dimensions: {
        errorType,
        errorMessage,
        ...context,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get latest metrics summary
   */
  async getMetricsSummary(hours: number = 24): Promise<any> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const { data: systemMetrics } = await supabase
      .from('system_metrics')
      .select('*')
      .gte('created_at', since.toISOString());

    const { data: performanceMetrics } = await supabase
      .from('performance_benchmarks')
      .select('*')
      .gte('measured_at', since.toISOString());

    const { data: qualityMetrics } = await supabase
      .from('quality_metrics')
      .select('*')
      .gte('measured_at', since.toISOString());

    return {
      systemMetrics: systemMetrics || [],
      performanceMetrics: performanceMetrics || [],
      qualityMetrics: qualityMetrics || [],
      timeRange: {
        start: since.toISOString(),
        end: new Date().toISOString()
      }
    };
  }

  /**
   * Performance monitoring wrapper for async operations
   */
  async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let error: any = null;

    try {
      const result = await operation();
      return result;
    } catch (err) {
      success = false;
      error = err;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      await this.recordPerformanceBenchmark({
        operation_name: operationName,
        min_response_time: duration,
        average_response_time: duration,
        max_response_time: duration,
        error_rate: success ? 0 : 1,
        throughput: 1
      });

      if (!success && error) {
        await this.trackError(operationName, error.message || 'Unknown error', {
          operationName,
          duration
        });
      }
    }
  }
}

export const metricsCollector = new MetricsCollector();
export default metricsCollector;
