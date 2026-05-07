// Central export file for all database services
export { Questions } from './questions';
export { Rubrics } from './rubrics';
export { TOS } from './tos';
export { GeneratedTests } from './generatedTests';

// Activity Log service with simplified interface
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;

export const ActivityLog = {
  async log(action: string, entityType: string, entityId?: string, meta?: any) {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("activity_log")
      .insert({
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        user_id: user?.id,
        meta: meta || {}
      });
    
    if (error) {
      console.error('Failed to log activity:', error);
    }
  }
};