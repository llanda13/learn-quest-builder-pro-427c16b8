/**
 * AI Assistant Service
 * 
 * Main orchestration layer for conversational AI
 * Handles:
 * - Intent filtering and validation
 * - Request routing
 * - Response validation
 * - Safe data access
 */

import { SYSTEM_PROMPT, isRestrictedIntent } from './systemPrompt';
import {
  getQuestionStatistics,
  getRecentActivitySummary,
  isSensitiveDataRequest,
  AggregatedStatistics,
  RecentActivitySummary
} from './safeDataAccess';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIServiceResponse {
  success: boolean;
  message: string;
  data?: AggregatedStatistics | RecentActivitySummary | Record<string, number | string> | { intent: string };
  error?: string;
}

/**
 * Classify user intent
 */
function classifyIntent(userMessage: string): {
  intent: string;
  isStatisticsRequest: boolean;
  isActivityRequest: boolean;
  isRestrictedAction: boolean;
} {
  const lowerMessage = userMessage.toLowerCase();

  // Check for statistics requests
  if (
    /statistics|how many|count|total|distribution|breakdown|summary/i.test(userMessage) &&
    /question|difficulty|type|subject|bloom|level/i.test(userMessage)
  ) {
    return {
      intent: 'statistics_request',
      isStatisticsRequest: true,
      isActivityRequest: false,
      isRestrictedAction: false
    };
  }

  // Check for recent activity requests
  if (/recent|new|added|latest|activity|trend/i.test(userMessage)) {
    return {
      intent: 'activity_request',
      isStatisticsRequest: false,
      isActivityRequest: true,
      isRestrictedAction: false
    };
  }

  // Check for restricted actions
  if (isRestrictedIntent(userMessage)) {
    return {
      intent: 'restricted_action',
      isStatisticsRequest: false,
      isActivityRequest: false,
      isRestrictedAction: true
    };
  }

  // Default: general conversation
  return {
    intent: 'general_conversation',
    isStatisticsRequest: false,
    isActivityRequest: false,
    isRestrictedAction: false
  };
}

/**
 * Handle statistics requests
 */
async function handleStatisticsRequest(userMessage: string): Promise<AIServiceResponse> {
  if (isSensitiveDataRequest(userMessage)) {
    return {
      success: false,
      message: 'I cannot provide access to sensitive system data.',
      error: 'SENSITIVE_DATA_REQUEST'
    };
  }

  try {
    const stats = await getQuestionStatistics();
    if (!stats) {
      return {
        success: false,
        message: 'Unable to retrieve statistics at this time.',
        error: 'DATA_ACCESS_ERROR'
      };
    }

    // Format statistics in a readable way
    const response = `
Here are the current question bank statistics:

📊 **Overall Statistics**
- Total Questions: ${stats.totalQuestions}
- Approved Questions: ${stats.approvedQuestions}
- Pending Questions: ${stats.pendingQuestions}
- Average Difficulty: ${stats.averageQuestionDifficulty}

📝 **By Question Type**
${formatFieldStats(stats.questionsByType)}

🎯 **By Bloom's Level**
${formatFieldStats(stats.questionsByBloomLevel)}

⚡ **By Difficulty**
${formatFieldStats(stats.questionsByDifficulty)}

📚 **By Subject**
${formatFieldStats(stats.questionsBySubject)}
`;

    return {
      success: true,
      message: response,
      data: stats
    };
  } catch (error) {
    console.error('Statistics request error:', error);
    return {
      success: false,
      message: 'An error occurred while processing your request.',
      error: 'PROCESSING_ERROR'
    };
  }
}

/**
 * Handle activity requests
 */
async function handleActivityRequest(userMessage: string): Promise<AIServiceResponse> {
  try {
    // Extract days limit if specified
    const daysMatch = userMessage.match(/(\d+)\s*days?/i);
    const days = daysMatch ? parseInt(daysMatch[1]) : 7;

    const activity = await getRecentActivitySummary(days);
    if (!activity) {
      return {
        success: false,
        message: 'Unable to retrieve activity data.',
        error: 'DATA_ACCESS_ERROR'
      };
    }

    const response = `
📈 **Recent Activity Summary**
Period: ${activity.period}
Total Questions Added: ${activity.totalAdded}

📝 **By Question Type**
${formatFieldStats(activity.byType)}

🎯 **By Bloom's Level**
${formatFieldStats(activity.byBloomLevel)}
`;

    return {
      success: true,
      message: response,
      data: activity
    };
  } catch (error) {
    console.error('Activity request error:', error);
    return {
      success: false,
      message: 'An error occurred while processing your request.',
      error: 'PROCESSING_ERROR'
    };
  }
}

/**
 * Handle restricted action attempts
 */
function handleRestrictedAction(): AIServiceResponse {
  return {
    success: false,
    message:
      'I cannot assist with system modifications or administrative actions, but I can help with academic content and question generation. What else can I help you with?',
    error: 'RESTRICTED_ACTION_BLOCKED'
  };
}

/**
 * Main request processor
 */
export async function processAIRequest(userMessage: string): Promise<AIServiceResponse> {
  // Validate input
  if (!userMessage || userMessage.trim().length === 0) {
    return {
      success: false,
      message: 'Please provide a valid message.',
      error: 'INVALID_INPUT'
    };
  }

  // Classify intent
  const classification = classifyIntent(userMessage);

  // Handle based on intent
  if (classification.isRestrictedAction) {
    return handleRestrictedAction();
  }

  if (classification.isStatisticsRequest) {
    return await handleStatisticsRequest(userMessage);
  }

  if (classification.isActivityRequest) {
    return await handleActivityRequest(userMessage);
  }

  // For general conversation, return system prompt instruction
  return {
    success: true,
    message:
      'I understand your question. I can help with academic topics, question generation, and platform statistics. How can I assist you?',
    data: { intent: classification.intent }
  };
}

/**
 * Validate response before sending
 */
export function validateAIResponse(response: AIServiceResponse): boolean {
  // Ensure no sensitive data leaks
  const responsText = response.message + JSON.stringify(response.data);
  const sensitivePatterns = [
    /password|secret|token|credential/i,
    /private.*key|api.*key/i,
    /user.*id.*=.*[0-9a-f]{8}-/i
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(responsText)) {
      console.warn('Sensitive data detected in response - blocking');
      return false;
    }
  }

  return true;
}

/**
 * Get system prompt
 */
export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Helper: Format field statistics
 */
function formatFieldStats(stats: Record<string, number>): string {
  return Object.entries(stats)
    .map(([key, count]) => `  • ${key}: ${count}`)
    .join('\n');
}
