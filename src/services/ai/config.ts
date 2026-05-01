/**
 * AI Assistant Configuration
 * 
 * Central configuration for AI behavior, limits, and safety settings
 */

export const AI_CONFIG = {
  // Request limits
  maxRequestLength: 5000,
  maxHistoryMessages: 100,
  requestTimeoutMs: 30000,

  // Rate limiting
  rateLimiting: {
    enabled: true,
    maxRequestsPerMinute: 30,
    maxRequestsPerHour: 500
  },

  // Data access settings
  dataAccess: {
    allowStatistics: true,
    allowActivitySummary: true,
    allowAggregatedData: true,
    blockSensitiveFields: true,
    sensitiveFields: [
      'password',
      'api_key',
      'secret_key',
      'auth_token',
      'user_email',
      'user_phone',
      'personal_info'
    ]
  },

  // Safety settings
  safety: {
    enableIntentFiltering: true,
    blockRestrictedActions: true,
    validateResponses: true,
    logRestrictedAttempts: true
  },

  // Conversation settings
  conversation: {
    maxContextLength: 10000,
    supportFollowUps: true,
    contextAwareness: true,
    personalityEnabled: true
  },

  // Content generation settings
  contentGeneration: {
    allowMultipleChoice: true,
    allowTrueFalse: true,
    allowFillInBlank: true,
    allowEssay: true,
    allowShortAnswer: true,
    maxGeneratedContent: 50
  }
};

/**
 * Validate request against configuration
 */
export function validateRequest(message: string): { valid: boolean; reason?: string } {
  if (message.length > AI_CONFIG.maxRequestLength) {
    return {
      valid: false,
      reason: `Request exceeds maximum length of ${AI_CONFIG.maxRequestLength} characters`
    };
  }

  return { valid: true };
}

/**
 * Get allowed capabilities list
 */
export function getAllowedCapabilities(): string[] {
  return [
    'Academic question answering',
    'Question bank statistics',
    'Recent activity summaries',
    'Assessment content generation',
    'Bloom\'s taxonomy guidance',
    'Question type explanations',
    'Difficulty level guidance'
  ];
}

/**
 * Get restricted actions
 */
export function getRestrictedActions(): string[] {
  return [
    'Database modifications (INSERT, UPDATE, DELETE)',
    'System configuration changes',
    'Access control modifications',
    'Sensitive data exposure',
    'System logic exposure',
    'Credential access',
    'Administrative operations'
  ];
}
