import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;

export const ActivityLog = {
  async log(action: string, entityType: string, entityId: string, meta?: any): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('activity_log').insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        meta: meta || {}
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }
};