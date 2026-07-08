import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useQualityMetrics } from "@/hooks/useQualityMetrics";
import { AuthProvider } from "./components/AuthProvider";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/admin/AdminDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import QuestionBankManager from "./pages/admin/QuestionBankManager";
import PendingApprovals from "./pages/admin/PendingApprovals";
import BulkImportPage from "./pages/admin/BulkImportPage";
import UserManagement from "./pages/admin/UserManagement";
import AdminAnalytics from "./pages/admin/Analytics";
import RecentlyDeleted from "./pages/admin/RecentlyDeleted";
import AdminSettings from "./pages/admin/Settings";
import DepartmentOfficers from "./pages/admin/DepartmentOfficers";
import AILogs from "./pages/admin/AILogs";
import TOSPage from "./pages/teacher/TOSPage";

import MyTests from "./pages/teacher/MyTests";
import TestPreview from "./pages/teacher/TestPreview";
import GeneratedTestPage from "./pages/teacher/GeneratedTestPage";
import TeacherHistory from "./pages/teacher/History";
import TOSHistory from "./pages/teacher/TOSHistory";
import TOSViewPage from "./pages/teacher/TOSViewPage";

import TeacherSettings from "./pages/teacher/Settings";
import ProfessionalExport from "./pages/ProfessionalExport";
import AIAssistant from "./pages/AIAssistant";
import Tests from "./pages/Tests";
import Collaboration from "./pages/Collaboration";
import Quality from "./pages/Quality";
import TestAssembly from "./pages/TestAssembly";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/layout/AdminLayout";
import { TeacherLayout } from "./components/layout/TeacherLayout";
import { ValidatorLayout } from "./layout/ValidatorLayout";
import ValidatorDashboard from "./pages/validator/ValidatorDashboard";
import ValidateTestPage from "./pages/validator/ValidateTestPage";
import ValidatorHistory from "./pages/validator/ValidatorHistory";
import NotFound from "./pages/NotFound";
import { warmPrintAssets } from "./print/assets";

// Pre-fetch the institution logo so Print/Export PDF don't pay for it later.
warmPrintAssets();


// Configure React Query so switching tabs / blurring the window does NOT
// trigger refetches. This preserves in-memory state (form inputs, AI
// conversations, in-flight generations) when users briefly leave the app.
// Background data still refreshes on explicit invalidation or remount.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 60_000,
    },
  },
});

const App = () => {
  // Initialize automated metrics collection
  useQualityMetrics();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              {/* Admin Routes - Professional Dark Theme */}
              <Route 
                path="/admin/*" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminLayout>
                      <Routes>
                        <Route index element={<Navigate to="/admin/dashboard" replace />} />
                        <Route path="dashboard" element={<AdminDashboard />} />
                        <Route path="question-bank" element={<QuestionBankManager />} />
                        <Route path="approvals" element={<PendingApprovals />} />
                        <Route path="bulk-import" element={<BulkImportPage />} />
                        <Route path="users" element={<UserManagement />} />
                        <Route path="analytics" element={<AdminAnalytics />} />
                        <Route path="recently-deleted" element={<RecentlyDeleted />} />
                        <Route path="ai-assistant" element={<AIAssistant />} />
                        <Route path="ai-logs" element={<AILogs />} />
                        <Route path="quality" element={<Quality />} />
                        <Route path="test-assembly" element={<TestAssembly />} />
                        <Route path="tests" element={<Tests />} />
                        <Route path="collaboration" element={<Collaboration />} />
                        <Route path="department-officers" element={<DepartmentOfficers />} />
                        <Route path="settings" element={<AdminSettings />} />
                      </Routes>
                    </AdminLayout>
                  </ProtectedRoute>
                } 
              />
              
              {/* Teacher Routes - Clean Light Theme */}
              <Route 
                path="/teacher/*" 
                element={
                  <ProtectedRoute requiredRole="teacher">
                    <TeacherLayout>
                      <Routes>
                        <Route index element={<Navigate to="/teacher/dashboard" replace />} />
                        <Route path="dashboard" element={<TeacherDashboard />} />
                        <Route path="tos" element={<TOSPage />} />
                        
                        <Route path="ai-assistant" element={<AIAssistant />} />
                        <Route path="my-tests" element={<MyTests />} />
                        <Route path="test/:testId" element={<TestPreview />} />
                        <Route path="generated-test/:testId" element={<GeneratedTestPage />} />
                        <Route path="preview-test/:testId" element={<GeneratedTestPage />} />
                        <Route path="history" element={<TeacherHistory />} />
                        <Route path="tos-history" element={<TOSHistory />} />
                        <Route path="tos-view/:tosId" element={<TOSViewPage />} />
                        <Route path="tos/:tosId" element={<TOSPage />} />
                        
                        <Route path="export" element={<ProfessionalExport />} />
                        <Route path="tests" element={<Tests />} />
                        <Route path="collaboration" element={<Collaboration />} />
                        <Route path="question-bank" element={<QuestionBankManager />} />
                        <Route path="settings" element={<TeacherSettings />} />
                      </Routes>
                    </TeacherLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Validator (Evaluator) Routes — accessible to validator + admin */}
              <Route
                path="/validator/*"
                element={
                  <ProtectedRoute allowedRoles={["validator", "admin"]}>
                    <ValidatorLayout>
                      <Routes>
                        <Route index element={<Navigate to="/validator/pending" replace />} />
                        <Route path="pending" element={<ValidatorDashboard />} />
                        <Route path="review/:testId" element={<ValidateTestPage />} />
                        <Route path="history" element={<ValidatorHistory />} />
                      </Routes>
                    </ValidatorLayout>
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirect */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
