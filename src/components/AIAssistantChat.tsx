import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, AlertCircle, CheckCircle } from 'lucide-react';
import { processAIRequest, validateAIResponse, ConversationMessage, AIServiceResponse } from '@/services/ai/aIService';
import { useToast } from '@/hooks/use-toast';

export default function AIAssistantChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      role: 'assistant',
      content:
        'Hello! I\'m your AI Assistant for the Testchemy platform. I can help you with:\n\n✨ Answering academic questions\n📊 Providing question bank statistics\n📝 Generating assessment content\n📈 Sharing recent activity summaries\n\nWhat would you like to know?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Clear previous error
    setError(null);

    // Add user message
    const userMessage: ConversationMessage = {
      role: 'user',
      content: input
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Process the request
      const response = await processAIRequest(input);

      // Validate response
      if (!validateAIResponse(response)) {
        setError('Security validation failed. Response blocked.');
        setLoading(false);
        return;
      }

      // Add assistant response
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: response.message
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Show toast for specific conditions
      if (!response.success) {
        if (response.error === 'RESTRICTED_ACTION_BLOCKED') {
          toast({
            title: 'Action Not Permitted',
            description: response.message,
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Unable to Process',
            description: response.message,
            variant: 'destructive'
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto h-screen flex flex-col">
      <Card className="flex-1 flex flex-col border-0 rounded-none">
        <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>AI Assistant</CardTitle>
              <CardDescription>Context-aware educational support</CardDescription>
            </div>
          </div>
        </CardHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  </div>
                )}

                <div
                  className={`max-w-sm lg:max-w-md px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-900 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Bot className="w-4 h-4 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <div className="bg-gray-100 px-4 py-2 rounded-lg rounded-bl-none">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-400"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200">
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        <CardContent className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ask me anything about the platform or academics..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={loading || !input.trim()} size="sm">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setInput('How many questions are in the bank?')}>
              📊 View statistics
            </Badge>
            <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setInput('What are recent additions?')}>
              📈 Recent activity
            </Badge>
            <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setInput('Help me understand Bloom\'s taxonomy')}>
              📚 Academic help
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
