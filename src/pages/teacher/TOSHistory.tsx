import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  FileText, 
  Calendar, 
  Copy, 
  Eye, 
  Search,
  Layers,
  Clock,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { TOSViewDialog } from '@/components/tos/TOSViewDialog';

interface TOSEntry {
  id: string;
  title: string | null;
  subject_no: string | null;
  course: string | null;
  description: string | null;
  year_section: string | null;
  exam_period: string | null;
  school_year: string | null;
  semester?: string | null;
  total_items: number | null;
  prepared_by?: string | null;
  noted_by?: string | null;
  created_at: string;
  topics: any;
  distribution: any;
}

export default function TOSHistory() {
  const [tosEntries, setTosEntries] = useState<TOSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewTos, setViewTos] = useState<TOSEntry | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchTOSEntries();
  }, []);

  const fetchTOSEntries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tos_entries')
        .select('*')
        .eq('owner', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTosEntries(data || []);
    } catch (error) {
      console.error('Error fetching TOS entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load TOS history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReuseTemplate = async (tos: TOSEntry) => {
    // Navigate to TOS Builder with template data pre-filled
    // The toast will be shown by TOSBuilder after data is successfully applied
    navigate('/teacher/tos', { 
      state: { 
        templateData: {
          subject_no: tos.subject_no,
          course: tos.course,
          description: tos.description,
          topics: tos.topics,
          distribution: tos.distribution,
          total_items: tos.total_items,
          prepared_by: '',
          noted_by: '',
          // Don't copy exam-specific data so teacher can set new values
          year_section: '',
          exam_period: '',
          school_year: '',
          semester: ''
        },
        isReusing: true
      }
    });
  };

  const handleViewTOS = (tos: TOSEntry) => {
    setViewTos(tos);
  };

  const filteredEntries = tosEntries.filter(tos => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (tos.title?.toLowerCase().includes(searchLower)) ||
      (tos.course?.toLowerCase().includes(searchLower)) ||
      (tos.subject_no?.toLowerCase().includes(searchLower)) ||
      (tos.description?.toLowerCase().includes(searchLower)) ||
      (tos.exam_period?.toLowerCase().includes(searchLower)) ||
      (tos.semester?.toLowerCase().includes(searchLower))
    );
  });

  const getTopicCount = (topics: any) => {
    if (Array.isArray(topics)) return topics.length;
    if (typeof topics === 'object' && topics !== null) return Object.keys(topics).length;
    return 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">TOS History</h1>
          <p className="text-muted-foreground">
            View and reuse your saved Table of Specifications templates
          </p>
        </div>
        <Button onClick={() => navigate('/teacher/tos')}>
          <FileText className="h-4 w-4 mr-2" />
          Create New TOS
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tosEntries.length}</p>
                <p className="text-sm text-muted-foreground">Total Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tosEntries.reduce((sum, tos) => sum + (tos.total_items || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Items Across TOS</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {tosEntries.length > 0 
                    ? format(new Date(tosEntries[0].created_at), 'MMM d')
                    : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Last Created</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by course, subject, exam period, or semester..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* TOS List */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No TOS templates match your search' : 'No TOS templates saved yet'}
            </p>
            <Button
              className="mt-4"
              onClick={() => navigate('/teacher/tos')}
            >
              Create Your First TOS
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((tos) => (
            <Card key={tos.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* TOS Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-lg truncate">
                          {tos.title || `${tos.subject_no || tos.course || 'Untitled'} - ${tos.exam_period || 'Exam'}`}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(tos.created_at), 'MMM d, yyyy')}
                          </span>
                          {tos.school_year && (
                            <Badge variant="outline" className="text-xs">
                              {tos.school_year}
                            </Badge>
                          )}
                          {tos.exam_period && (
                            <Badge variant="secondary" className="text-xs">
                              {tos.exam_period}
                            </Badge>
                          )}
                          {tos.semester && (
                            <Badge variant="secondary" className="text-xs">
                              {tos.semester}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{tos.total_items || 0}</strong> items
                          </span>
                          <span className="text-muted-foreground">
                            <strong className="text-foreground">{getTopicCount(tos.topics)}</strong> topics
                          </span>
                          {tos.course && (
                            <span className="text-muted-foreground">
                              Course: <strong className="text-foreground">{tos.course}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewTOS(tos)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleReuseTemplate(tos)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Reuse Template
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tip Section */}
      <Card className="bg-muted/50 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Reuse Templates for Efficiency</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Reuse Template" to create a new TOS based on an existing one. 
                This preserves topics and Bloom's taxonomy distribution while letting you update 
                semester-specific details like exam period and year section.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TOS View Dialog */}
      <TOSViewDialog
        open={!!viewTos}
        onOpenChange={(open) => { if (!open) setViewTos(null); }}
        tos={viewTos}
      />
    </div>
  );
}
