# Security & Automation Implementation

## Overview

This document outlines the comprehensive security, automation, and monitoring infrastructure implemented for the question management system.

## 1. Security Infrastructure

### User Roles System

**CRITICAL**: Roles are now stored in a separate `user_roles` table to prevent privilege escalation attacks.

- **Created Enum**: `app_role` with values: `admin`, `teacher`, `validator`, `student`
- **Created Table**: `user_roles` with proper foreign key constraints
- **Security Function**: `has_role(_user_id, _role)` - Security definer function to check roles without RLS recursion
- **Migration**: Existing roles from `profiles` table were migrated to `user_roles`

### Row-Level Security (RLS) Policies

#### Questions Table
- ✅ Read: Anyone can read approved questions, authenticated users can read all
- ✅ Create: Only teachers and admins can create questions
- ✅ Update: Owners can update their questions, admins can update any
- ✅ Delete: Owners can delete their questions, admins can delete any

#### Classification Validations Table
- ✅ Read: Only validators and admins can view
- ✅ Create: Only validators and admins can create (must be validator_id = auth.uid())
- ✅ Update: Validators can update their own validations

#### User Roles Table
- ✅ Read: Users can view their own roles
- ✅ Manage: Only admins can manage roles

## 2. Automation & Triggers

### Automatic Similarity Recalculation

When a question is created or updated, the system automatically:
1. Marks the question for similarity update in metadata
2. Sends a notification via `pg_notify` to trigger background processing
3. Calls the `update-semantic` edge function to:
   - Generate OpenAI embeddings for the question
   - Calculate cosine similarity with all other questions
   - Store similarity pairs in `question_similarities` table

**Trigger Function**: `trigger_similarity_recalculation()`
- Fires on INSERT or UPDATE of `question_text`, `topic`, or `bloom_level`
- Sets metadata flag: `needs_similarity_update`
- Emits PostgreSQL notification on channel `similarity_update`

## 3. Edge Functions

### update-semantic
**Purpose**: Handle semantic similarity calculation and storage
**Authentication**: Requires JWT (verify_jwt = true)
**Process**:
1. Receives question_id and optional question_text
2. Generates OpenAI embedding using `text-embedding-3-small` model
3. Stores embedding in `questions.semantic_vector`
4. Calculates cosine similarity with all other questions
5. Stores similarities in `question_similarities` table (threshold: 0.7)
6. Logs performance metrics

### Other Functions
- `classify-questions`: No JWT required (public API)
- `enhanced-classify`: No JWT required (public API)
- `generate-embedding`: No JWT required (used by other services)
- `validation-workflow`: Requires JWT
- `rubrics`: Requires JWT
- `semantic-similarity`: Requires JWT

## 4. Monitoring & Metrics

### System Metrics Logging

**Function**: `log_classification_metric(p_question_id, p_confidence, p_cognitive_level, p_response_time_ms)`
- Logs classification performance metrics
- Tracks confidence scores
- Measures response times
- Stores in `system_metrics` table

**Metrics Collected**:
- Classification confidence scores
- Response times (ms)
- Cognitive level distribution
- Similarity calculation performance

### Security Metrics Dashboard

Component: `SecurityMetrics.tsx`
Displays:
- Total active users
- Role distribution (admin, validator, teacher, student)
- Total validations completed
- Pending reviews count

## 5. Updated Hooks

### useUserRole
**Breaking Changes**: 
- Now returns `UserRoleData` interface (expanded from previous)
- Fetches from `user_roles` table instead of `profiles`
- Supports multiple roles per user
- New methods: `hasRole()`, `refetch()`

**New Fields**:
- `isValidator`: boolean
- `hasRole(role)`: function to check specific role
- `refetch()`: function to manually refresh role data

### useTaxonomyClassification
**Enhancement**:
- Now logs classification metrics to `system_metrics`
- Tracks performance of each classification operation
- Stores confidence scores for monitoring

## 6. Database Changes

### New Tables
- `user_roles`: Stores user role assignments

### New Functions
- `has_role(uuid, app_role)`: Check if user has specific role
- `get_current_user_role()`: Get highest priority role for current user
- `trigger_similarity_recalculation()`: Trigger for automatic similarity updates
- `log_classification_metric()`: Log classification performance metrics

### New Indexes
- `idx_user_roles_user_id`: Fast user role lookups
- `idx_user_roles_role`: Fast role-based queries
- `idx_questions_owner`: Fast owner-based queries
- `idx_questions_approved`: Fast approval status queries
- `idx_questions_needs_review`: Fast review queue queries
- `idx_classification_validations_validator`: Fast validator queries
- `idx_system_metrics_category_measured`: Fast metrics queries

## 7. Security Best Practices Implemented

✅ **Separate Roles Table**: Prevents privilege escalation
✅ **Security Definer Functions**: Prevents RLS recursion
✅ **Proper RLS Policies**: Least privilege access
✅ **JWT Authentication**: Edge functions properly secured
✅ **Input Validation**: All edge functions validate inputs
✅ **Error Logging**: Comprehensive error tracking
✅ **Performance Monitoring**: Metric collection for all operations
✅ **Audit Trail**: Classification validations tracked

## 8. Known Security Warnings

The following pre-existing security warnings were flagged by the Supabase linter:
- Security definer views (5 errors) - Pre-existing views
- Function search_path warnings (15 warnings) - Pre-existing functions
- Auth OTP expiry warning - Configuration setting
- Leaked password protection - Configuration setting
- Postgres version patches available - Infrastructure update needed

**Note**: The new functions created in this migration all properly set `search_path = public`.

## 9. Next Steps

### Immediate Actions
1. Test new role-based permissions in UI
2. Verify similarity recalculation triggers work correctly
3. Monitor classification metrics in SecurityMetrics dashboard
4. Test edge function authentication

### Future Enhancements
1. Add automated testing for RLS policies
2. Implement rate limiting on edge functions
3. Add admin UI for role management
4. Create audit log viewer
5. Add performance dashboards
6. Implement ML model retraining pipeline

## 10. Migration Guide

### For Existing Users
1. All existing roles were automatically migrated from `profiles` to `user_roles`
2. Default role is `teacher` if no role was set
3. Update any code that checks `role` from `profiles` to use `useUserRole` hook

### For Developers
1. Always use `useUserRole` hook for role checks
2. Never check roles from localStorage or client-side storage
3. Use `hasRole()` method for permission checks
4. Call `refetch()` after role changes

### For Admins
1. Assign roles using the `user_roles` table
2. Users can have multiple roles (highest priority applies)
3. Monitor security metrics dashboard for role distribution
4. Review pending validations regularly

## 11. API Reference

### useUserRole Hook
```typescript
const { 
  role,           // Current highest priority role
  loading,        // Loading state
  isAdmin,        // Is user admin?
  isTeacher,      // Is user teacher, validator, or admin?
  isValidator,    // Is user validator or admin?
  hasRole,        // Check specific role: hasRole('validator')
  refetch         // Manually refresh role data
} = useUserRole();
```

### Database Functions
```sql
-- Check if user has role
SELECT has_role(auth.uid(), 'admin');

-- Get current user's role
SELECT get_current_user_role();

-- Log classification metric
SELECT log_classification_metric(
  question_id::uuid,
  confidence::numeric,
  'Remember',
  response_time_ms::numeric
);
```

## 12. Troubleshooting

### Users Can't See Questions
- Check RLS policies are enabled
- Verify user has proper role assigned
- Check question approval status

### Similarity Not Calculating
- Verify OpenAI API key is set
- Check edge function logs
- Ensure trigger is enabled on questions table

### Role Changes Not Reflecting
- Call `refetch()` on useUserRole hook
- Check user_roles table for correct assignments
- Verify has_role function is working

### Metrics Not Showing
- Check system_metrics table has data
- Verify log_classification_metric function is being called
- Check SecurityMetrics component permissions
