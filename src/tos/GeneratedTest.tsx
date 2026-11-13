import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Download, ArrowLeft, FileText, CheckCircle, Printer, Key } from "lucide-react"
import { TOSData } from "@/pages/TOS"
import { usePDFExport } from "@/hooks/usePDFExport"
import { useToast } from "@/hooks/use-toast"
import { ExamPrintTemplate } from "@/components/print/ExamPrintTemplate"

interface GeneratedTestProps {
  tosData: TOSData
  testQuestions: TestQuestion[]
  onBack: () => void
}

export interface TestQuestion {
  id: number
  topicName: string
  bloomLevel: string
  difficulty: 'Easy' | 'Average' | 'Difficult'
  type: 'multiple-choice' | 'true-false' | 'essay' | 'fill-blank'
  question: string
  options?: string[]
  correctAnswer: string | number
  points: number
}

export function GeneratedTest({ tosData, testQuestions, onBack }: GeneratedTestProps) {
  const { exportTestQuestions } = usePDFExport();
  const { toast } = useToast();
  const totalPoints = testQuestions.reduce((sum, q) => sum + q.points, 0)

  const handleExportTest = async () => {
    const testTitle = `${tosData.description} - ${tosData.examPeriod} Exam`;
    const success = await exportTestQuestions(testQuestions, testTitle);
    if (success) {
      toast({
        title: "Test Exported",
        description: "Test questions and answer key exported successfully.",
      });
    } else {
      toast({
        title: "Export Failed",
        description: "Failed to export test. Please try again.",
        variant: "destructive",
      });
    }
  }

  const easyQuestions = testQuestions.filter(q => q.difficulty === 'Easy')
  const averageQuestions = testQuestions.filter(q => q.difficulty === 'Average')
  const difficultQuestions = testQuestions.filter(q => q.difficulty === 'Difficult')

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPackage = () => {
    // Mock download functionality
    const blob = new Blob(['Test Package Generated'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tosData.subjectNo}-${tosData.examPeriod}-Test-Package.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Transform testQuestions to match the test structure expected by ExamPrintTemplate
  const printTestData = {
    title: `${tosData.description} - ${tosData.examPeriod} Exam`,
    subject: tosData.description,
    course: tosData.course,
    year_section: tosData.yearSection,
    exam_period: tosData.examPeriod,
    school_year: tosData.schoolYear,
    items: testQuestions.map(q => ({
      question_text: q.question,
      question_type: q.type === 'multiple-choice' ? 'mcq' : q.type,
      choices: q.options,
      correct_answer: q.correctAnswer,
      points: q.points,
      difficulty: q.difficulty,
      bloom_level: q.bloomLevel,
      topic: q.topicName
    }))
  };

  return (
    <>
      {/* Print-only exam template */}
      <ExamPrintTemplate test={printTestData} showAnswerKey={false} />
      
      {/* Screen UI - hidden when printing */}
      <div className="space-y-6 screen-only">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <CardTitle>Test Generated Successfully</CardTitle>
            </div>
            <Button variant="outline" onClick={onBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to TOS
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{testQuestions.length}</div>
              <div className="text-sm text-muted-foreground">Total Questions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{easyQuestions.length}</div>
              <div className="text-sm text-muted-foreground">Easy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{averageQuestions.length}</div>
              <div className="text-sm text-muted-foreground">Average</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{difficultQuestions.length}</div>
              <div className="text-sm text-muted-foreground">Difficult</div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print Test
            </Button>
            <Button variant="outline" className="gap-2">
              <Key className="w-4 h-4" />
              Answer Key
            </Button>
            <Button onClick={handleExportTest} className="gap-2">
              <Download className="w-4 h-4" />
              Export as PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated Questions Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Generated Test Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Easy Questions */}
            {easyQuestions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold">Easy Questions</h3>
                  <Badge variant="secondary">Remembering & Understanding</Badge>
                </div>
                <div className="space-y-4">
                  {easyQuestions.map((question, index) => (
                    <QuestionPreview key={question.id} question={question} />
                  ))}
                </div>
              </div>
            )}

            {/* Average Questions */}
            {averageQuestions.length > 0 && (
              <div>
                <Separator />
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold">Average Questions</h3>
                  <Badge variant="secondary">Applying & Analyzing</Badge>
                </div>
                <div className="space-y-4">
                  {averageQuestions.map((question, index) => (
                    <QuestionPreview key={question.id} question={question} />
                  ))}
                </div>
              </div>
            )}

            {/* Difficult Questions */}
            {difficultQuestions.length > 0 && (
              <div>
                <Separator />
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-lg font-semibold">Difficult Questions</h3>
                  <Badge variant="secondary">Evaluating & Creating</Badge>
                </div>
                <div className="space-y-4">
                  {difficultQuestions.map((question, index) => (
                    <QuestionPreview key={question.id} question={question} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  )
}

function QuestionPreview({ question }: { question: TestQuestion }) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'bg-green-100 text-green-800'
      case 'Average': return 'bg-yellow-100 text-yellow-800'
      case 'Difficult': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">Q{question.id}</span>
          <Badge variant="outline" className="text-xs">
            {question.topicName}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {question.bloomLevel}
          </Badge>
          <Badge className={`text-xs ${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {question.points} {question.points === 1 ? 'point' : 'points'}
        </span>
      </div>
      
      <p className="text-sm leading-relaxed">{question.question}</p>
      
      {question.type === 'multiple-choice' && question.options && (
        <div className="ml-4 space-y-1">
          {question.options.map((option, index) => (
            <div 
              key={index} 
              className={`text-sm flex items-start gap-2 ${
                typeof question.correctAnswer === 'number' && question.correctAnswer === index 
                  ? 'font-medium text-green-600' 
                  : 'text-muted-foreground'
              }`}
            >
              <span className="font-medium">
                {String.fromCharCode(65 + index)}.
              </span>
              <span>{option}</span>
            </div>
          ))}
        </div>
      )}
      
      {question.type === 'essay' && (
        <div className="text-sm text-muted-foreground italic">
          Essay question - Answer key: {question.correctAnswer}
        </div>
      )}
    </div>
  )
}