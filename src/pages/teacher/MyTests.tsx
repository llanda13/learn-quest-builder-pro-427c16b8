import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Eye, FileText, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface GeneratedTest {
  id: string;
  title: string | null;
  subject: string | null;
  course: string | null;
  exam_period: string | null;
  school_year: string | null;
  semester: string | null;
  points_per_question: number | null;
  created_at: string;
  items: any;
  validation_status: 'draft' | 'pending_validation' | 'validated' | 'revision_requested';
}

const STATUS_META: Record<GeneratedTest['validation_status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft — Editable', variant: 'outline' },
  pending_validation: { label: 'Pending Validation', variant: 'secondary' },
  validated: { label: 'Validated', variant: 'default' },
  revision_requested: { label: 'Revision Requested', variant: 'destructive' },
};

type StatusFilter = 'all' | 'draft' | 'pending_validation' | 'validated';
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function MyTests() {
  const [tests, setTests] = useState<GeneratedTest[]>([]);
  const [college, setCollege] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
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
        (supabase as any)
          .from('generated_tests')
          .select('id, title, subject, course, exam_period, school_year, semester, points_per_question, created_at, items, validation_status')
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
        semester: (test as any).semester ?? null,
        points_per_question: test.points_per_question,
        created_at: test.created_at || '',
        items: test.items,
        validation_status: ((test as any).validation_status ?? 'pending_validation') as GeneratedTest['validation_status'],
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

  const filteredTests = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    return tests.filter((test) => {
      const matchesSearch = !query || [college, test.exam_period, test.subject, test.course]
        .some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || test.validation_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tests, college, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTests.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const visibleTests = filteredTests.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const formatDateTime = (dateStr: string) => {
    const timestamp = new Date(dateStr);
    if (!dateStr || Number.isNaN(timestamp.getTime())) return 'Unavailable';

    const date = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(timestamp);
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp);
    return { date, time };
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-normal">My Generated Tests</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and access your generated assessments.</p>
        </div>
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
        <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm" aria-label="Generated test records">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search subject, exam, or college"
                aria-label="Search generated tests"
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Filter by validation status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft — Editable</SelectItem>
                  <SelectItem value="pending_validation">Pending Validation</SelectItem>
                  <SelectItem value="validated">Validated</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="whitespace-nowrap">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="w-[5.5rem]" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">College</TableHead>
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">Exam Type</TableHead>
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">School Year / Semester</TableHead>
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">Subject</TableHead>
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">Date and Time Generated</TableHead>
                  <TableHead className="whitespace-nowrap px-5 text-right font-semibold text-foreground">Total Points</TableHead>
                  <TableHead className="whitespace-nowrap px-5 font-semibold text-foreground">Validation Status</TableHead>
                  <TableHead className="whitespace-nowrap px-5 text-right font-semibold text-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                      No generated tests match your search or status filter.
                    </TableCell>
                  </TableRow>
                ) : visibleTests.map((test) => {
                  const generatedAt = formatDateTime(test.created_at);
                  return (
                    <TableRow key={test.id} className="odd:bg-background even:bg-muted/20 hover:bg-muted/50">
                      <TableCell className="max-w-56 whitespace-normal px-5 py-5 font-medium">{college || 'Not set'}</TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-5">{test.exam_period || 'Not set'}</TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-5">
                        {[test.school_year, test.semester].filter(Boolean).join(' – ') || 'Not set'}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-nowrap px-5 py-5">
                        {test.course && test.subject
                          ? `${test.course} – ${test.subject}`
                          : test.subject || test.course || 'Not set'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-5">
                        {typeof generatedAt === 'string' ? generatedAt : (
                          <span className="flex flex-col">
                            <span>{generatedAt.date}</span>
                            <span className="text-sm text-muted-foreground">{generatedAt.time}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-5 text-right font-medium tabular-nums">{getTotalPoints(test)}</TableCell>
                      <TableCell className="px-5 py-5">
                        <Badge
                          variant={STATUS_META[test.validation_status].variant}
                          className={
                            test.validation_status === 'validated'
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : test.validation_status === 'pending_validation'
                                ? 'border-secondary/70 bg-secondary/40 text-foreground'
                                : test.validation_status === 'draft'
                                  ? 'border-border bg-muted text-muted-foreground'
                                  : undefined
                          }
                        >
                          {STATUS_META[test.validation_status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-border hover:border-primary/30 hover:bg-primary/5"
                          onClick={() => navigate(`/teacher/test/${test.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                          View Test
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite">
              {filteredTests.length === 0
                ? 'Showing 0 tests'
                : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredTests.length)} of ${filteredTests.length} tests`}
            </p>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-20 text-center tabular-nums">Page {currentPage} of {totalPages}</span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
