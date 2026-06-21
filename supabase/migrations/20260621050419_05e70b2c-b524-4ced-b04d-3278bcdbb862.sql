-- Revoke from PUBLIC and anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.assign_admin_role(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_default_teacher_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_tos(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_question_similarity(text, text, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_presence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_available_test_versions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_question_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_document_collaborator(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher_or_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tos_collaborator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tos_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_classification_metric(uuid, numeric, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_question_used(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_topic_for_subject(uuid, text, real) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_approval_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_approval_metadata() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_similarity_recalculation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_test_metadata_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_tos_exists(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_version_balance(uuid) FROM PUBLIC, anon;

-- Move pg_trgm extension out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;