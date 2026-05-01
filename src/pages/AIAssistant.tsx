import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Send, Loader2, User, Trash2, Sparkles, FileQuestion,
  Tag, BarChart3, BookOpen, CheckCircle, AlertTriangle, Save,
  PlusCircle, Search, Wand2, ArrowRight, Copy, RefreshCw,
  MessageSquare, Clock, Plus, FileText, Target, Lightbulb, ListChecks
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Types ───
type IntentType = "generate_questions" | "classify_question" | "assign_topic" | "improve_question" | "system_stats" | "explain_concept" | "general_academic";

interface Message {
  role: "user" | "assistant";
  content: string;
  structured?: boolean;
  data?: any;
  intent?: IntentType;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  active_intent: IntentType | null;
  last_message_at: string;
  created_at: string;
}

interface GeneratedQuestion {
  question_text: string;
  question_type: string;
  choices?: Record<string, string>;
  correct_answer: string;
  difficulty: string;
  bloom_level: string;
  topic: string;
  specialization?: string;
  ai_generated?: boolean;
}

// ─── Mode definitions ───
const MODES = [
  { id: "generate_questions" as IntentType, label: "Generate", icon: PlusCircle, description: "Create new assessment questions", color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30" },
  { id: "classify_question" as IntentType, label: "Classify", icon: Tag, description: "Bloom's level, difficulty & knowledge dimension", color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30" },
  { id: "improve_question" as IntentType, label: "Improve", icon: Wand2, description: "Grammar, clarity & Bloom's alignment", color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950/30" },
  { id: "assign_topic" as IntentType, label: "Assign Topic", icon: Search, description: "Topic, subject & specialization", color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950/30" },
  { id: "system_stats" as IntentType, label: "Statistics", icon: BarChart3, description: "Question bank analytics", color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
  { id: "explain_concept" as IntentType, label: "Explain", icon: BookOpen, description: "Academic concepts & strategies", color: "text-rose-600", bgColor: "bg-rose-50 dark:bg-rose-950/30" },
];

const QUICK_PROMPTS: Record<IntentType, string[]> = {
  generate_questions: ["Generate 5 MCQ questions about Photosynthesis", "Create 3 True/False questions on Computer Networks", "Generate 4 essay questions about World War II"],
  classify_question: ["What is the primary function of the mitochondria in a cell?", "Compare and contrast TCP and UDP protocols, providing examples."],
  improve_question: ["What is the answer of 1+1?", "TCP is better than UDP. True or False?"],
  assign_topic: ["What are the key differences between SQL and NoSQL databases?", "Explain the process of cellular respiration."],
  system_stats: ["How many questions are in the question bank?", "Show question distribution by Bloom's level"],
  explain_concept: ["Explain Bloom's Taxonomy levels with examples", "What are effective assessment strategies?"],
  general_academic: [],
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lohmzywgbkntvpuygvfx.supabase.co";
const AI_CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-assistant`;

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  // Draft input is mirrored to localStorage so a tab switch / refresh
  // never drops what the user was typing.
  const [input, setInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem("ai-assistant.draft-input") || ""; } catch { return ""; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeIntent, setActiveIntent] = useState<IntentType | null>(null);
  const [savingQuestions, setSavingQuestions] = useState<Set<number>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem("ai-assistant.active-conv") || null; } catch { return null; }
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  // Generate form state
  const [genTopic, setGenTopic] = useState("");
  const [genType, setGenType] = useState("mcq");
  const [genCount, setGenCount] = useState("5");
  const [genDifficulty, setGenDifficulty] = useState("average");
  const [genBloom, setGenBloom] = useState("understanding");

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Persist draft input (debounced) so brief interruptions don't lose typing.
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.localStorage.setItem("ai-assistant.draft-input", input); } catch { /* noop */ }
    }, 200);
    return () => clearTimeout(t);
  }, [input]);

  // Remember the active conversation across reloads.
  useEffect(() => {
    try {
      if (activeConversationId) {
        window.localStorage.setItem("ai-assistant.active-conv", activeConversationId);
      } else {
        window.localStorage.removeItem("ai-assistant.active-conv");
      }
    } catch { /* noop */ }
  }, [activeConversationId]);

  // ─── Load conversations from DB ───
  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;
    setLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const convos: Conversation[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        messages: (row.messages as any[]) || [],
        active_intent: row.active_intent,
        last_message_at: row.last_message_at,
        created_at: row.created_at,
      }));
      setConversations(convos);
      // Auto-restore the previously open conversation after a reload / tab switch.
      if (activeConversationId && messages.length === 0) {
        const prev = convos.find(c => c.id === activeConversationId);
        if (prev) {
          setMessages(prev.messages);
          setActiveIntent(prev.active_intent as IntentType | null);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  // ─── Save conversation to DB (debounced) ───
  const saveConversation = useCallback(async (convId: string, msgs: Message[], intent: IntentType | null) => {
    if (!user || msgs.length === 0) return;
    try {
      // Generate title from first user message
      const firstUserMsg = msgs.find(m => m.role === "user");
      const title = firstUserMsg ? firstUserMsg.content.substring(0, 80) + (firstUserMsg.content.length > 80 ? "..." : "") : "New Conversation";

      const { error } = await supabase
        .from("ai_conversations")
        .upsert({
          id: convId,
          user_id: user.id,
          title,
          messages: msgs as any,
          active_intent: intent,
          last_message_at: new Date().toISOString(),
        });
      if (error) throw error;

      // Update local state
      setConversations(prev => {
        const exists = prev.find(c => c.id === convId);
        if (exists) {
          return prev.map(c => c.id === convId ? { ...c, title, messages: msgs, active_intent: intent, last_message_at: new Date().toISOString() } : c)
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
        }
        return [{ id: convId, title, messages: msgs, active_intent: intent, last_message_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...prev];
      });
    } catch (err) {
      console.error("Failed to save conversation:", err);
    }
  }, [user]);

  const debouncedSave = useCallback((convId: string, msgs: Message[], intent: IntentType | null) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveConversation(convId, msgs, intent), 1000);
  }, [saveConversation]);

  // ─── Load a conversation ───
  const loadConversation = (conv: Conversation) => {
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setActiveIntent(conv.active_intent as IntentType | null);
  };

  // ─── Start new conversation ───
  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setActiveIntent(null);
  };

  // ─── Delete conversation ───
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from("ai_conversations").delete().eq("id", convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConversationId === convId) {
        startNewConversation();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  // ─── Send message ───
  const sendMessage = useCallback(async (text: string, intent?: IntentType) => {
    if (!text.trim() || isLoading) return;
    const resolvedIntent = intent || activeIntent || undefined;
    const userMsg: Message = { role: "user", content: text.trim(), intent: resolvedIntent || undefined };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    try { window.localStorage.removeItem("ai-assistant.draft-input"); } catch { /* noop */ }
    setIsLoading(true);
    setShowSidebar(false);

    // Create or reuse conversation ID
    let convId = activeConversationId;
    if (!convId) {
      convId = crypto.randomUUID();
      setActiveConversationId(convId);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const resp = await fetch(AI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: updatedMessages.map(m => ({ role: m.role, content: m.content })), intent: resolvedIntent }),
      });

      if (resp.status === 429) { toast({ title: "Rate Limited", description: "Too many requests. Please wait and try again.", variant: "destructive" }); setIsLoading(false); return; }
      if (resp.status === 402) { toast({ title: "Credits Exhausted", description: "AI credits exhausted. Please add funds.", variant: "destructive" }); setIsLoading(false); return; }
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await resp.json();
        let finalMessages: Message[];
        if (data.refusal) {
          finalMessages = [...updatedMessages, { role: "assistant" as const, content: data.message }];
        } else if (data.structured && data.data) {
          finalMessages = [...updatedMessages, { role: "assistant" as const, content: data.message, structured: true, data: data.data, intent: data.intent }];
        } else if (data.message) {
          finalMessages = [...updatedMessages, { role: "assistant" as const, content: data.message }];
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          finalMessages = updatedMessages;
        }
        setMessages(finalMessages);
        debouncedSave(convId!, finalMessages, activeIntent);
        return;
      }

      // SSE streaming
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantSoFar = "";
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && !last.structured) return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }

      // Save after stream completes
      setMessages(prev => {
        debouncedSave(convId!, prev, activeIntent);
        return prev;
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, toast, activeIntent, activeConversationId, debouncedSave]);

  // ─── Save question ───
  const saveQuestion = async (question: GeneratedQuestion, index: number) => {
    if (!user) return;
    setSavingQuestions(prev => new Set(prev).add(index));
    try {
      const { error } = await supabase.from("questions").insert({
        question_text: question.question_text,
        question_type: question.question_type,
        choices: question.choices || null,
        correct_answer: question.correct_answer,
        difficulty: question.difficulty,
        bloom_level: question.bloom_level,
        cognitive_level: question.bloom_level,
        topic: question.topic,
        specialization: question.specialization || "",
        created_by: user.id,
        owner: user.id,
        approved: true,
        ai_confidence_score: 0.85,
        metadata: { ai_generated: true, source: "ai_assistant" } as any,
      });
      if (error) throw error;
      toast({ title: "Saved!", description: "Question saved to Question Bank." });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingQuestions(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  };

  const saveAllQuestions = async (questions: GeneratedQuestion[]) => {
    if (!user) return;
    try {
      const toSave = questions.map(q => ({
        question_text: q.question_text, question_type: q.question_type, choices: q.choices || null,
        correct_answer: q.correct_answer, difficulty: q.difficulty, bloom_level: q.bloom_level,
        cognitive_level: q.bloom_level, topic: q.topic, specialization: q.specialization || "",
        created_by: user.id, owner: user.id, approved: true, ai_confidence_score: 0.85,
        metadata: { ai_generated: true, source: "ai_assistant" } as any,
      }));
      const { error } = await supabase.from("questions").insert(toSave);
      if (error) throw error;
      toast({ title: "All Saved!", description: `${questions.length} questions saved to Question Bank.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  // ─── Generate form submit ───
  const handleGenerateSubmit = () => {
    if (!genTopic.trim()) { toast({ title: "Missing topic", description: "Please enter a topic.", variant: "destructive" }); return; }
    const prompt = `Generate ${genCount} ${genType.replace(/_/g, " ")} questions about "${genTopic}" at ${genDifficulty} difficulty level, targeting ${genBloom} Bloom's level.`;
    sendMessage(prompt, "generate_questions");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ─── Question card renderer ───
  const renderQuestionCard = (q: GeneratedQuestion, idx: number) => (
    <Card key={idx} className="border border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium flex-1">{idx + 1}. {q.question_text}</p>
          <Button size="sm" variant="outline" onClick={() => saveQuestion(q, idx)} disabled={savingQuestions.has(idx)} className="shrink-0">
            {savingQuestions.has(idx) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            <span className="ml-1 text-xs">Save</span>
          </Button>
        </div>
        {q.choices && Object.keys(q.choices).length > 0 && (
          <div className="pl-4 space-y-1">
            {Object.entries(q.choices).map(([key, val]) => (
              <p key={key} className={`text-xs ${key === q.correct_answer ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {key}. {val} {key === q.correct_answer && "✓"}
              </p>
            ))}
          </div>
        )}
        {(!q.choices || Object.keys(q.choices).length === 0) && q.correct_answer && (
          <p className="text-xs text-primary pl-4"><strong>Answer:</strong> {q.correct_answer}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary" className="text-[10px]">{q.question_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{q.bloom_level}</Badge>
          <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
          <Badge variant="outline" className="text-[10px]">{q.topic}</Badge>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Render improve result ───
  const renderImproveResult = (data: any) => (
    <Card className="border border-border mt-3">
      <CardContent className="p-4 space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Original:</p>
          <p className="text-sm line-through text-muted-foreground">{data.original_text}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-primary">Improved:</p>
          <p className="text-sm font-medium">{data.improved_text}</p>
        </div>
        {data.choices && Object.keys(data.choices).length > 0 && (
          <div className="pl-4 space-y-1">
            {Object.entries(data.choices).map(([key, val]) => (
              <p key={key} className={`text-xs ${key === data.correct_answer ? "font-bold text-primary" : "text-muted-foreground"}`}>
                {key}. {val as string} {key === data.correct_answer && "✓"}
              </p>
            ))}
          </div>
        )}
        {data.changes?.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Changes:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {data.changes.map((c: string, i: number) => <li key={i}>• {c}</li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[10px]">{data.question_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{data.bloom_level}</Badge>
          <Badge variant="outline" className="text-[10px]">{data.difficulty}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(data.improved_text).then(() => toast({ title: "Copied!" }))} className="text-xs">
          <Copy className="w-3 h-3 mr-1" /> Copy Improved Text
        </Button>
      </CardContent>
    </Card>
  );

  // ─── Render structured content ───
  const renderStructuredContent = (msg: Message) => {
    if (!msg.structured || !msg.data) return null;

    if (msg.intent === "generate_questions" && msg.data.questions) {
      return (
        <div className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{msg.data.questions.length} questions generated</p>
              {msg.data.duplicates_removed > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> {msg.data.duplicates_removed} duplicates removed
                </Badge>
              )}
            </div>
            {msg.data.questions.length > 1 && (
              <Button size="sm" variant="default" onClick={() => saveAllQuestions(msg.data.questions)} className="text-xs h-7">
                <Save className="w-3 h-3 mr-1" /> Save All to Bank
              </Button>
            )}
          </div>
          {msg.data.duplicate_details?.length > 0 && (
            <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 space-y-0.5">
              {msg.data.duplicate_details.map((d: string, i: number) => <p key={i}>• {d}</p>)}
            </div>
          )}
          {msg.data.questions.map((q: GeneratedQuestion, i: number) => renderQuestionCard(q, i))}
        </div>
      );
    }

    if (msg.intent === "improve_question" && msg.data) {
      return renderImproveResult(msg.data);
    }

    return null;
  };

  // Filter modes based on role — non-admins can't see Statistics if it involves user data
  const availableModes = MODES.filter(mode => {
    if (mode.id === "system_stats" && !isAdmin) {
      // Teachers still see it but the backend restricts user-related data
      return true;
    }
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-0px)] lg:h-screen">
      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">AI Assistant</h1>
              <p className="text-xs text-muted-foreground">
                System-Aware Academic Tool
                {isAdmin && <Badge variant="secondary" className="ml-2 text-[10px]">Admin</Badge>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeIntent && (
              <Badge variant="secondary" className="text-xs gap-1">
                {MODES.find(m => m.id === activeIntent)?.label} Mode
              </Badge>
            )}
            {activeIntent && (
              <Button variant="outline" size="sm" onClick={() => setActiveIntent(null)} className="text-xs">
                ← All Modes
              </Button>
            )}
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={startNewConversation} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowSidebar(!showSidebar)} className="text-muted-foreground">
              <MessageSquare className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !activeIntent ? (
              /* ─── Conversation Starters ─── */
              <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center space-y-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Try one of these to get started, or type your own question below.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                  {(isAdmin ? [
                    { icon: BarChart3, text: "Show me question bank statistics and distribution", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50" },
                    { icon: PlusCircle, text: "Generate 10 MCQ questions about Data Structures", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50" },
                    { icon: Wand2, text: "How do I improve question quality for assessments?", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50" },
                    { icon: BookOpen, text: "Explain Bloom's Taxonomy with assessment examples", color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50" },
                    { icon: Tag, text: "Classify this: What are the layers of the OSI model?", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50" },
                    { icon: ListChecks, text: "Generate 5 True/False questions on Computer Networks", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50" },
                    { icon: Target, text: "What makes a good distractor in multiple choice items?", color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50" },
                    { icon: FileText, text: "How should I structure a Table of Specifications?", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50" },
                    { icon: Lightbulb, text: "Suggest topics for a midterm exam in Database Systems", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50" },
                  ] : [
                    { icon: PlusCircle, text: "Generate 5 MCQ questions about Photosynthesis", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50" },
                    { icon: Tag, text: "Classify this: What is the function of mitochondria?", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50" },
                    { icon: Wand2, text: "Improve this question: What is the answer of 1+1?", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50" },
                    { icon: BookOpen, text: "What are effective strategies for creating assessments?", color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50" },
                    { icon: ListChecks, text: "Create 3 essay questions about the Solar System", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50" },
                    { icon: FileText, text: "How do I build a Table of Specifications for my exam?", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50" },
                    { icon: Target, text: "Explain the difference between Applying and Analyzing", color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50" },
                    { icon: Lightbulb, text: "Suggest topics for a final exam in General Biology", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50" },
                    { icon: Search, text: "What Bloom's level is: Compare TCP and UDP protocols?", color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-950/50" },
                  ]).map((starter, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(starter.text)}
                      disabled={isLoading}
                      className={`${starter.bg} border border-border rounded-xl p-4 text-left transition-all hover:shadow-md group flex items-start gap-3 disabled:opacity-50`}
                    >
                      <starter.icon className={`w-5 h-5 ${starter.color} shrink-0 mt-0.5`} />
                      <span className="text-sm text-foreground leading-snug">{starter.text}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                    </button>
                  ))}
                </div>

                <div className="w-full max-w-2xl flex gap-2">
                  <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Or ask any academic question..." className="min-h-[44px] max-h-32 resize-none" rows={1} disabled={isLoading} />
                  <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} size="icon" className="shrink-0 h-[44px] w-[44px]">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

            ) : messages.length === 0 && activeIntent ? (
              /* ─── Mode-specific guided UI ─── */
              <div className="space-y-6 max-w-2xl mx-auto">
                {activeIntent === "generate_questions" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <PlusCircle className="w-5 h-5 text-emerald-600" /> Generate Questions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Topic *</label>
                        <Input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="e.g., Photosynthesis, Data Structures" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Type</label>
                          <Select value={genType} onValueChange={setGenType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mcq">Multiple Choice</SelectItem>
                              <SelectItem value="true_false">True/False</SelectItem>
                              <SelectItem value="identification">Identification</SelectItem>
                              <SelectItem value="essay">Essay</SelectItem>
                              <SelectItem value="fill_in_the_blank">Fill in the Blank</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Count</label>
                          <Select value={genCount} onValueChange={setGenCount}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 5, 10, 15, 20].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Difficulty</label>
                          <Select value={genDifficulty} onValueChange={setGenDifficulty}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="easy">Easy</SelectItem>
                              <SelectItem value="average">Average</SelectItem>
                              <SelectItem value="difficult">Difficult</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Bloom's Level</label>
                          <Select value={genBloom} onValueChange={setGenBloom}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="remembering">Remembering</SelectItem>
                              <SelectItem value="understanding">Understanding</SelectItem>
                              <SelectItem value="applying">Applying</SelectItem>
                              <SelectItem value="analyzing">Analyzing</SelectItem>
                              <SelectItem value="evaluating">Evaluating</SelectItem>
                              <SelectItem value="creating">Creating</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={handleGenerateSubmit} disabled={isLoading} className="w-full">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate Questions
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {activeIntent !== "generate_questions" && (
                  <>
                    <div className="text-center space-y-2 pt-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                        {(() => { const m = MODES.find(a => a.id === activeIntent); return m ? <m.icon className={`w-6 h-6 ${m.color}`} /> : <Brain className="w-6 h-6 text-primary" />; })()}
                      </div>
                      <h3 className="text-lg font-semibold">{MODES.find(a => a.id === activeIntent)?.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {activeIntent === "classify_question" && "Paste a question below to classify its Bloom's level, difficulty, and knowledge dimension."}
                        {activeIntent === "improve_question" && "Paste a question below to improve grammar, clarity, and Bloom's alignment."}
                        {activeIntent === "assign_topic" && "Paste a question below to identify its topic, subject, and specialization."}
                        {activeIntent === "system_stats" && (isAdmin ? "Ask about question bank statistics and system analytics." : "Ask about question bank statistics (topic distribution, Bloom's levels, etc.).")}
                        {activeIntent === "explain_concept" && "Ask about any academic or educational concept."}
                      </p>
                    </div>

                    {QUICK_PROMPTS[activeIntent]?.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-center">
                        {QUICK_PROMPTS[activeIntent].map((prompt) => (
                          <button key={prompt} onClick={() => sendMessage(prompt, activeIntent)} className="px-3 py-2 rounded-lg border border-border bg-card text-xs hover:bg-accent hover:text-accent-foreground transition-colors text-left max-w-xs">
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 max-w-2xl mx-auto">
                      <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                        placeholder={
                          activeIntent === "classify_question" ? "Paste a question to classify..." :
                          activeIntent === "improve_question" ? "Paste a question to improve..." :
                          activeIntent === "assign_topic" ? "Paste a question to assign topic..." :
                          activeIntent === "system_stats" ? "Ask about statistics..." : "Ask your question..."
                        }
                        className="min-h-[44px] max-h-32 resize-none" rows={2} disabled={isLoading}
                      />
                      <Button onClick={() => sendMessage(input, activeIntent)} disabled={!input.trim() || isLoading} size="icon" className="shrink-0 h-[44px] w-[44px]">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ─── Conversation messages ─── */
              messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs"><Brain className="w-4 h-4" /></AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {msg.role === "assistant" ? (
                      <div>
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {renderStructuredContent(msg)}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                      <AvatarFallback className="bg-accent text-accent-foreground text-xs"><User className="w-4 h-4" /></AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))
            )}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0"><AvatarFallback className="bg-primary text-primary-foreground text-xs"><Brain className="w-4 h-4" /></AvatarFallback></Avatar>
                <div className="bg-muted rounded-2xl px-4 py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom input for active conversation */}
        {messages.length > 0 && (
          <div className="border-t border-border p-4 bg-card shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Continue the conversation..." className="min-h-[44px] max-h-32 resize-none" rows={1} disabled={isLoading} />
              <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} size="icon" className="shrink-0 h-[44px] w-[44px]">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Conversation Sidebar - Right Side */}
      {showSidebar && (
        <div className="w-64 border-l border-border bg-muted/30 flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <Button onClick={startNewConversation} className="w-full text-xs" size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Conversation
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => { loadConversation(conv); setShowSidebar(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors group flex items-start gap-2 ${
                    activeConversationId === conv.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{conv.title}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(conv.last_message_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </button>
              ))
            )}
          </div>
          {!isAdmin && (
            <div className="p-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">
                Your conversations are private and only visible to you.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
