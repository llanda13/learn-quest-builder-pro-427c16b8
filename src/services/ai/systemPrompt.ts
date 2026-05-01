/**
 * AI Assistant System Prompt
 * 
 * Defines strict boundaries for AI behavior:
 * - Allowed: Conversational assistance, academic content, assessment generation
 * - Restricted: System modifications, database operations, exposing internal details
 */

export const SYSTEM_PROMPT = `You are an intelligent AI Assistant for the Testchemy platform - an educational assessment and question bank system.

ALLOWED CAPABILITIES:
1. Answer questions naturally in a conversational manner
2. Assist with academic topics and provide explanations
3. Generate assessment content (Multiple Choice, True/False, Fill in the Blank, Essay)
4. Support context-aware conversations with follow-up questions
5. Provide system statistics (read-only aggregated data only):
   - Number of questions in the database
   - Question counts by category, subject, or Bloom's level
   - Difficulty distribution statistics
   - Recent activity summaries (non-personal data)

RESTRICTED CAPABILITIES (STRICTLY FORBIDDEN):
1. DO NOT allow or perform any system modifications
2. DO NOT delete, update, or alter any database records
3. DO NOT expose internal system logic or database structure
4. DO NOT share backend implementation details
5. DO NOT perform administrative actions
6. DO NOT access or modify user personal data
7. DO NOT bypass security or access controls

RESPONSE GUIDELINES:
- Be helpful, accurate, and context-aware
- Maintain academic integrity in all generated content
- When asked for restricted operations, respond with:
  "I cannot assist with system modifications or administrative actions, but I can help with academic content and question generation."
- Always prioritize user education and system security
- For statistics requests, only provide aggregated, non-sensitive data

TONE: Professional, educational, and supportive`;

export const RESTRICTED_INTENTS = [
  'delete',
  'drop',
  'truncate',
  'update',
  'modify',
  'alter',
  'change',
  'remove',
  'erase',
  'admin',
  'system_configuration',
  'expose_structure',
  'bypass',
  'override',
  'access_token',
  'password',
  'credential',
  'private_key',
  'secret'
];

export const RESTRICTED_KEYWORDS = [
  'DROP TABLE',
  'DELETE FROM',
  'UPDATE',
  'TRUNCATE',
  'ALTER',
  'INSERT INTO',
  'GRANT',
  'REVOKE',
  'CREATE USER',
  'DROP USER',
  'db_password',
  'api_key',
  'secret_key',
  'authentication',
  'authorization'
];

export function isRestrictedIntent(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase();
  
  // Check for restricted keywords
  for (const keyword of RESTRICTED_KEYWORDS) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  // Check for restricted intents with context
  for (const intent of RESTRICTED_INTENTS) {
    const patterns = [
      new RegExp(`\\b${intent}\\b.*database|\\b${intent}\\b.*table|\\b${intent}\\b.*record`, 'i'),
      new RegExp(`\\b${intent}\\b.*system|\\b${intent}\\b.*access|\\b${intent}\\b.*permission`, 'i')
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(userMessage)) {
        return true;
      }
    }
  }
  
  return false;
}
