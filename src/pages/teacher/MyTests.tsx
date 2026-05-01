import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, Eye, GraduationCap, BookOpen, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface GeneratedTest {
  id: string;
  title: string | null;
  subject: string | null;
  course: string | null;
  exam_period: string | null;
  school_year: string | null;
  points_per_question: number | null;
  created_at: string;
  items: any;
}

export default function MyTests() {
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [college, setCollege] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchMyTests();
  }, []);

  const fetchMyTests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [testsRes, profileRes] = await Promise.all([
        supabase
          .from('generated_tests')
          .select('id, title, subject, course, exam_period, school_year, points_per_question, created_at, items')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('college')
          .eq('id', user.id)
          .single()
      ]);

      if (testsRes.error) throw testsRes.error;
      setCollege(profileRes.data?.college || null);

      const mappedTests: GeneratedTest[] = (testsRes.data || []).map(test => ({
        id: test.id,
        title: test.title,
        subject: test.subject,
        course: test.course,
        exam_period: test.exam_period,
        school_year: test.school_year,
        points_per_question: test.points_per_question,
        created_at: test.created_at || '',
        items: test.items
      }));

      setTests(mappedTests);
    } catch (error) {
      console.error('Error fetching tests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your tests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalPoints = (test: GeneratedTest) => {
    if (!Array.isArray(test.items)) return 0;
    return test.items.reduce((sum: number, item: any) => sum + (item.points || 1), 0);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Generated Tests</h1>
        <Button onClick={() => navigate('/teacher/tos')}>
          Generate New Test
        </Button>
      </div>

      {tests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No tests generated yet</p>
            <Button
              className="mt-4"
              onClick={() => navigate('/teacher/tos')}
            >
              Create Your First Test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <Card key={test.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold text-foreground">College:</span>{' '}
                      <span className="text-muted-foreground">{college || 'Not set'}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold text-foreground">Exam:</span>{' '}
                      <span className="text-muted-foreground">{test.exam_period || 'Not set'}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold text-foreground">Subject:</span>{' '}
                      <span className="text-muted-foreground">
                        {test.course && test.subject
                          ? `${test.course} – ${test.subject}`
                          : test.subject || test.course || 'Not set'}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold text-foreground">Date Generated:</span>{' '}
                      <span className="text-muted-foreground">{formatDate(test.created_at)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="font-semibold text-foreground">Total Points:</span>{' '}
                      <span className="text-muted-foreground">{getTotalPoints(test)}</span>
                    </span>
                  </div>
                </div>
                <Button
                  className="w-full mt-2"
                  variant="outline"
                  onClick={() => navigate(`/teacher/test/${test.id}`)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Test
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
