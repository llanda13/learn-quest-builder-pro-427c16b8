# AI Assistant Implementation Guide

## Overview

The AI Assistant provides ChatGPT-like conversational capabilities while maintaining strict security boundaries for system protection. It operates through four interconnected layers:

1. **System Prompt Control** - Defines allowed and restricted behaviors
2. **Safe Data Access Layer** - Read-only access to aggregated statistics
3. **Intent Filtering** - Detects and blocks restricted actions
4. **Response Validation** - Ensures no sensitive data leaks

## Architecture

### Component Structure

```
src/
├── services/ai/
│   ├── aIService.ts          # Main orchestration layer
│   ├── systemPrompt.ts       # System prompt & intent definitions
│   ├── safeDataAccess.ts     # Read-only statistics access
│   └── config.ts             # Configuration & capabilities
├── components/
│   └── AIAssistantChat.tsx   # React chat UI component
```

## Allowed Capabilities

The AI Assistant can perform the following operations:

### 1. Conversational Q&A
- Answer academic questions naturally
- Provide educational explanations
- Support context-aware follow-up questions
- Engage in multi-turn conversations

### 2. Statistics & Analytics
- Total question count
- Question distribution by type (MCQ, T/F, Essay, etc.)
- Distribution by Bloom's level (Remember, Understand, Apply, etc.)
- Distribution by difficulty (Easy, Average, Difficult)
- Distribution by subject/category
- Approval status statistics

### 3. Activity Summaries
- Recent questions added
- Trend analysis (past 7, 14, 30 days)
- Type distribution in recent additions
- Aggregate (non-personal) activity data

### 4. Assessment Content Generation
- Multiple Choice questions
- True/False questions
- Fill in the Blank questions
- Essay prompts
- Question explanations

### 5. Educational Support
- Bloom's taxonomy guidance
- Question design best practices
- Assessment strategies
- Learning objective alignment

## Restricted Capabilities

The following operations are **STRICTLY FORBIDDEN**:

### System Modifications ❌
```
- DELETE FROM questions WHERE ...
- UPDATE users SET ...
- DROP TABLE ...
- ALTER TABLE ...
- INSERT INTO ...
```

### Access Control ❌
```
- Expose database structure
- Share API keys or credentials
- Modify permissions
- Bypass authentication
- Access user personal data
```

### Sensitive Data ❌
```
- Passwords
- Authentication tokens
- Private keys
- API credentials
- Personal user information
- System implementation details
```

## Intent Filtering Mechanism

The system detects restricted intents using:

### Keyword Pattern Matching
```typescript
// Restricted keywords that trigger blocking
const RESTRICTED_KEYWORDS = [
  'DROP TABLE',
  'DELETE FROM',
  'UPDATE',
  'api_key',
  'password',
  'private_key',
  ...
];
```

### Intent Classification
```typescript
classifyIntent(userMessage)
  → statistics_request      // Allowed
  → activity_request        // Allowed
  → general_conversation    // Allowed
  → restricted_action       // BLOCKED
  → sensitive_data_request  // BLOCKED
```

### Response Blocking
When a restricted action is detected:

```
User: "DELETE all questions from the database"
AI:   "I cannot assist with system modifications or administrative 
       actions, but I can help with academic content and question 
       generation."
```

## Safe Data Access Layer

### Read-Only Statistics Access

```typescript
// Example: Get question statistics
const stats = await getQuestionStatistics();
// Returns only aggregated, non-sensitive data
{
  totalQuestions: 1523,
  questionsByType: { 
    mcq: 600, 
    true_false: 400, 
    essay: 523 
  },
  questionsByBloomLevel: { 
    remembering: 229, 
    understanding: 229, 
    applying: 305, 
    ... 
  },
  approvedQuestions: 1450,
  pendingQuestions: 73
}
```

### Sensitive Data Blocking

```typescript
// Example: Blocked sensitive request
User: "Show me user email addresses"
AI:   "I cannot provide access to sensitive system data."

// Checks for patterns:
- /password|secret|token|credential/i
- /user.*email|personal.*info/i
- /private.*key|api.*key/i
```

## Usage Examples

### Example 1: Statistics Query
```
User: "How many questions are in the database and how are they 
       distributed by Bloom's level?"

AI: Returns formatted statistics with:
    - Total count
    - Breakdown by Bloom level
    - Difficulty distribution
    - Approval status
```

### Example 2: Activity Summary
```
User: "What questions were added last week?"

AI: Provides recent activity summary:
    - Number of questions added
    - Submitted by question type
    - Distribution by Bloom level
    - Trends (percentage increase/decrease)
```

### Example 3: Blocked Request
```
User: "Can you delete all pending questions?"

AI: "I cannot assist with system modifications or administrative 
     actions, but I can help with academic content and question 
     generation."
```

### Example 4: Educational Help
```
User: "How do I design a good multiple choice question?"

AI: Provides best practices:
    - Clear, unambiguous stem
    - Plausible distractors
    - Appropriate difficulty
    - Learning objective alignment
    - Scoring criteria
```

## Response Validation Pipeline

Every response goes through validation:

```
1. Intent Filtering
   ↓ (Restricted?) → Block & return safe message
   ↓ (Allowed?) → Continue
   
2. Sensitive Data Check
   ↓ (Contains sensitive patterns?) → Block
   ↓ (Safe?) → Continue
   
3. Response Formatting
   ↓ Format for clarity
   ↓ Add metadata if applicable
   
4. Return to User
   ↓ Display with status indicators
```

## Configuration

### Enable/Disable Features

```typescript
// src/services/ai/config.ts
export const AI_CONFIG = {
  dataAccess: {
    allowStatistics: true,        // Enable statistics
    allowActivitySummary: true,   // Enable activity reports
    blockSensitiveFields: true    // Enforce blocking
  },
  safety: {
    enableIntentFiltering: true,  // Enable filtering
    blockRestrictedActions: true  // Block dangerous requests
  }
};
```

### Add New Restricted Keywords

```typescript
// In systemPrompt.ts
export const RESTRICTED_KEYWORDS = [
  'YOUR_NEW_KEYWORD',
  ...existing keywords
];
```

## Integration Guide

### Using the AI Service Directly

```typescript
import { processAIRequest, validateAIResponse } from '@/services/ai/aIService';

// Process a request
const response = await processAIRequest(userMessage);

if (response.success) {
  console.log(response.message);  // Display to user
  console.log(response.data);     // Use optional data
} else {
  console.error(response.error);  // Handle error
}
```

### Using the Chat Component

```tsx
import AIAssistantChat from '@/components/AIAssistantChat';

// In your page/component
<AIAssistantChat />
```

## Security Best Practices

1. **Always validate user input** before processing
2. **Never expose database columns** in responses
3. **Log all restricted attempts** for security audit
4. **Validate responses** before sending to users
5. **Use aggregated data only** for statistics
6. **Keep system prompt updated** with new patterns
7. **Monitor for bypass attempts** and update filters
8. **Rate limit** requests to prevent abuse

## Monitoring & Logging

Restricted action attempts should be logged:

```typescript
// In production, log to security system
console.error('RESTRICTED_ACTION_ATTEMPT', {
  userMessage: sanitized_message,
  blockReason: 'SENSITIVE_DATA_REQUEST',
  timestamp: new Date(),
  userContext: anonymized_user_info
});
```

## Future Enhancements

1. **Multi-language support** for internationalization
2. **Advanced context awareness** using embeddings
3. **Fine-tuned LLM integration** (GPT-4, Claude, etc.)
4. **User preference learning** for personalized responses
5. **Feedback loop** for continuous improvement
6. **Audit trail** for compliance and security
7. **Rate limiting** per user/session
8. **Conversation persistence** for context continuity

## Troubleshooting

### "Sensitivity validation failed" Error
- The response contains patterns matching sensitive data
- Check the response content before returning
- Update sensitivePatterns if false positive

### Statistics Request Returns Null
- Database connection issue
- Missing suitable permissions
- Data access layer error
- Check logs for detailed error message

### Intent Not Classified Correctly
- Add more specific patterns for new intents
- Update classifyIntent function with new cases
- Test regex patterns thoroughly before deployment

## Support & Maintenance

For issues or enhancements:
1. Check the logs for error details
2. Review the configuration for applicable settings
3. Test intent filtering with new keywords
4. Update system prompt if needed
5. Run validation tests after changes
