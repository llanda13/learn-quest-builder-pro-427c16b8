import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Brain, Database, CheckCircle, AlertCircle } from "lucide-react"
import { TOSData } from "@/pages/TOS"
import { TestQuestion } from "./GeneratedTest"

interface TestGeneratorProps {
  tosData: TOSData
  onTestGenerated: (testId: string) => void
  onCancel: () => void
}

interface GenerationStep {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'completed' | 'error'
  description: string
}

export function TestGenerator({ tosData, onTestGenerated, onCancel }: TestGeneratorProps) {
  const navigate = useNavigate()
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState<GenerationStep[]>([
    {
      id: 'analyze',
      title: 'Analyzing TOS Matrix',
      status: 'pending',
      description: 'Processing topic distribution and Bloom levels'
    },
    {
      id: 'textbank',
      title: 'Querying Text Bank',
      status: 'pending',
      description: 'Searching for existing questions in database'
    },
    {
      id: 'ai-generate',
      title: 'AI Question Generation',
      status: 'pending',
      description: 'Generating missing questions using AI engine'
    },
    {
      id: 'quality-check',
      title: 'Quality Assurance',
      status: 'pending',
      description: 'Validating question structure and Bloom alignment'
    },
    {
      id: 'finalize',
      title: 'Finalizing Test',
      status: 'pending',
      description: 'Arranging questions and creating answer key'
    }
  ])

  const bloomVerbs = {
    remembering: ['Define', 'List', 'Identify', 'Name', 'State', 'Recall'],
    understanding: ['Explain', 'Describe', 'Interpret', 'Summarize', 'Paraphrase'],
    applying: ['Apply', 'Demonstrate', 'Use', 'Implement', 'Execute'],
    analyzing: ['Analyze', 'Compare', 'Contrast', 'Examine', 'Differentiate'],
    evaluating: ['Evaluate', 'Assess', 'Critique', 'Judge', 'Appraise'],
    creating: ['Create', 'Design', 'Develop', 'Construct', 'Generate']
  }

  const generateMockQuestions = (): TestQuestion[] => {
    const questions: TestQuestion[] = []
    let questionId = 1

    Object.entries(tosData.distribution).forEach(([topicName, topicData]) => {
      // Generate questions for each Bloom level
      Object.entries(topicData).forEach(([bloomLevel, itemNumbers]) => {
        if (bloomLevel === 'hours' || bloomLevel === 'total' || !Array.isArray(itemNumbers)) return

        itemNumbers.forEach((itemNum) => {
          const difficulty = getDifficultyFromBloom(bloomLevel)
          const verb = bloomVerbs[bloomLevel as keyof typeof bloomVerbs]?.[Math.floor(Math.random() * bloomVerbs[bloomLevel as keyof typeof bloomVerbs].length)] || 'Explain'
          
          let question: TestQuestion

          if (['remembering', 'understanding', 'applying'].includes(bloomLevel)) {
            // Multiple choice for easier levels
            question = {
              id: itemNum,
              topicName,
              bloomLevel: bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1),
              difficulty,
              type: 'multiple-choice',
              question: generateQuestionText(verb, topicName, bloomLevel),
              options: generateOptions(topicName, bloomLevel),
              correctAnswer: 0, // First option is correct
              points: difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 2 : 3
            }
          } else {
            // Essay for higher levels
            question = {
              id: itemNum,
              topicName,
              bloomLevel: bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1),
              difficulty,
              type: 'essay',
              question: generateQuestionText(verb, topicName, bloomLevel),
              correctAnswer: `Sample answer for ${bloomLevel} level question`,
              points: difficulty === 'Easy' ? 2 : difficulty === 'Average' ? 3 : 5
            }
          }

          questions.push(question)
        })
      })
    })

    return questions.sort((a, b) => a.id - b.id)
  }

  const getDifficultyFromBloom = (bloomLevel: string): 'Easy' | 'Average' | 'Difficult' => {
    if (['remembering', 'understanding'].includes(bloomLevel)) return 'Easy'
    if (['applying', 'analyzing'].includes(bloomLevel)) return 'Average'
    return 'Difficult'
  }

  const generateQuestionText = (verb: string, topic: string, bloomLevel: string): string => {
    const topicTemplates = {
      'Requirements Engineering': {
        remembering: [`${verb} what a software requirement is.`, `${verb} the types of requirements in software engineering.`],
        understanding: [`${verb} why requirements engineering is crucial in software development.`, `${verb} the difference between functional and non-functional requirements.`],
        applying: [`${verb} requirements gathering techniques to a given scenario.`, `${verb} the concept of requirement prioritization in a project.`],
        analyzing: [`${verb} the requirements document and identify potential conflicts.`, `${verb} the stakeholder needs in the given case study.`],
        evaluating: [`${verb} the completeness of the requirements specification provided.`, `${verb} the quality of the requirements gathering process used.`],
        creating: [`${verb} a comprehensive requirements document for the given system.`, `${verb} a requirements validation checklist for the project.`]
      },
      'Data and Process Modeling': {
        remembering: [`${verb} the components of a data flow diagram.`, `${verb} the symbols used in process modeling.`],
        understanding: [`${verb} how data flows through the system processes.`, `${verb} the purpose of context diagrams in system analysis.`],
        applying: [`${verb} data flow diagram notation to model the given process.`, `${verb} process decomposition to break down complex processes.`],
        analyzing: [`${verb} the data flow diagram for logical inconsistencies.`, `${verb} the process model to identify bottlenecks.`],
        evaluating: [`${verb} the effectiveness of the proposed data model.`, `${verb} whether the process model meets business requirements.`],
        creating: [`${verb} a complete data flow diagram for the enrollment system.`, `${verb} a process model for the inventory management system.`]
      },
      'Object Modeling and Development Strategies': {
        remembering: [`${verb} the principles of object-oriented design.`, `${verb} the different types of relationships in UML.`],
        understanding: [`${verb} how inheritance works in object-oriented programming.`, `${verb} the concept of encapsulation in system design.`],
        applying: [`${verb} object-oriented design principles to the given problem.`, `${verb} UML diagrams to represent the system structure.`],
        analyzing: [`${verb} the class diagram for design flaws.`, `${verb} the object relationships in the system model.`],
        evaluating: [`${verb} the object-oriented design against SOLID principles.`, `${verb} the scalability of the proposed object model.`],
        creating: [`${verb} a complete class diagram for the library management system.`, `${verb} an object-oriented solution for the e-commerce platform.`]
      }
    }

    const templates = topicTemplates[topic as keyof typeof topicTemplates]?.[bloomLevel as keyof typeof topicTemplates['Requirements Engineering']]
    return templates?.[Math.floor(Math.random() * templates.length)] || `${verb} the concept of ${topic.toLowerCase()}.`
  }

  const generateOptions = (topic: string, bloomLevel: string): string[] => {
    const optionTemplates = {
      'Requirements Engineering': [
        'A documented need or expectation for a software system',
        'A programming language specification',
        'A testing methodology',
        'A project management technique'
      ],
      'Data and Process Modeling': [
        'A graphical representation of data flow in a system',
        'A database schema design',
        'A user interface prototype',
        'A network architecture diagram'
      ],
      'Object Modeling and Development Strategies': [
        'A blueprint for creating objects in object-oriented programming',
        'A database table structure',
        'A network protocol specification',
        'A user authentication method'
      ]
    }

    return optionTemplates[topic as keyof typeof optionTemplates] || [
      'Option A',
      'Option B', 
      'Option C',
      'Option D'
    ]
  }

  const updateStep = (index: number, status: GenerationStep['status']) => {
    setSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, status } : step
    ))
  }

  const generateQuestionsFromDatabase = async (): Promise<TestQuestion[]> => {
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const questions: TestQuestion[] = []
      let questionId = 1

      // For each topic and bloom level, try to fetch questions from database
      for (const [topicName, topicData] of Object.entries(tosData.distribution)) {
        for (const [bloomLevel, itemNumbers] of Object.entries(topicData)) {
          if (bloomLevel === 'hours' || bloomLevel === 'total' || !Array.isArray(itemNumbers)) continue

          // Try to fetch existing questions
          const { data: existingQuestions } = await supabase
            .from('questions')
            .select('*')
            .eq('topic', topicName)
            .eq('bloom_level', bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1))
            .limit(itemNumbers.length)

          let questionsAdded = 0
          
          // Use existing questions if available
          if (existingQuestions && existingQuestions.length > 0) {
            for (const dbQuestion of existingQuestions.slice(0, itemNumbers.length)) {
              const difficulty = getDifficultyFromBloom(bloomLevel)
              
              questions.push({
                id: itemNumbers[questionsAdded] || questionId++,
                topicName,
                bloomLevel: bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1),
                difficulty,
                type: dbQuestion.question_type === 'mcq' ? 'multiple-choice' : 'essay',
                question: dbQuestion.question_text,
                options: dbQuestion.choices ? Object.values(dbQuestion.choices) : undefined,
                correctAnswer: dbQuestion.question_type === 'mcq' ? 
                  (dbQuestion.choices ? Object.keys(dbQuestion.choices).indexOf(dbQuestion.correct_answer) : 0) : 
                  undefined,
                points: difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 2 : 3
              })
              questionsAdded++
            }
          }

          // Generate remaining questions if needed
          const remainingNeeded = itemNumbers.length - questionsAdded
          for (let i = 0; i < remainingNeeded; i++) {
            const difficulty = getDifficultyFromBloom(bloomLevel)
            const verb = bloomVerbs[bloomLevel as keyof typeof bloomVerbs]?.[Math.floor(Math.random() * bloomVerbs[bloomLevel as keyof typeof bloomVerbs].length)] || 'Explain'
            
            questions.push({
              id: itemNumbers[questionsAdded + i] || questionId++,
              topicName,
              bloomLevel: bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1),
              difficulty,
              type: ['remembering', 'understanding', 'applying'].includes(bloomLevel) ? 'multiple-choice' : 'essay',
              question: generateQuestionText(verb, topicName, bloomLevel),
              options: ['remembering', 'understanding', 'applying'].includes(bloomLevel) ? 
                generateOptions(topicName, bloomLevel) : undefined,
              correctAnswer: ['remembering', 'understanding', 'applying'].includes(bloomLevel) ? 0 : undefined,
              points: difficulty === 'Easy' ? 1 : difficulty === 'Average' ? 2 : 3
            })
          }
        }
      }

      return questions.sort((a, b) => a.id - b.id)
    } catch (error) {
      console.error('Error generating questions from database:', error)
      return generateMockQuestions()
    }
  }

  const simulateGeneration = async () => {
    setIsGenerating(true)
    setProgress(0)

    try {
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i)
        updateStep(i, 'in-progress')
        await new Promise(resolve => setTimeout(resolve, 1500))
        updateStep(i, 'completed')
        setProgress(((i + 1) / steps.length) * 100)
      }

      // Generate test using the service
      const { generateTestFromTOS } = await import('@/services/ai/testGenerationService')
      const tosCriteria: any[] = []
      
      Object.entries(tosData.distribution).forEach(([topicName, topicData]) => {
        Object.entries(topicData).forEach(([bloomLevel, itemNumbers]) => {
          if (bloomLevel === 'hours' || bloomLevel === 'total' || !Array.isArray(itemNumbers)) return
          
          const difficulty = getDifficultyFromBloom(bloomLevel)
          const questionType = ['remembering', 'understanding', 'applying'].includes(bloomLevel)
            ? 'mcq'
            : 'essay'

          tosCriteria.push({
            topic: topicName,
            bloom_level: bloomLevel.charAt(0).toUpperCase() + bloomLevel.slice(1),
            knowledge_dimension: 'conceptual',
            difficulty: difficulty.toLowerCase(),
            count: itemNumbers.length,
            item_numbers: itemNumbers,
            question_type: questionType
          })
        })
      })

      const generatedTest = await generateTestFromTOS(
        tosCriteria,
        `${tosData.description} - ${tosData.examPeriod}`,
        {
          subject: tosData.course,
          exam_period: tosData.examPeriod,
          school_year: tosData.schoolYear,
          year_section: tosData.yearSection,
          course: tosData.course,
          tos_id: (tosData as any).id ?? null
        }
      )
      
      setTimeout(() => {
        setIsGenerating(false)
        navigate(`/teacher/generated-test/${generatedTest.id}`)
      }, 500)
    } catch (error) {
      console.error('Test generation failed:', error)
      setIsGenerating(false)
      updateStep(currentStep, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Test Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* TOS Summary */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">Subject: {tosData.description}</p>
                <p className="text-sm text-muted-foreground">Total Items: {tosData.totalItems}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Topics: {Object.keys(tosData.distribution).length}</p>
                <p className="text-sm text-muted-foreground">Period: {tosData.examPeriod}</p>
              </div>
            </div>

            {/* Progress */}
            {isGenerating && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Generation Progress</span>
                  <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            {/* Steps */}
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="flex-shrink-0">
                    {step.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {step.status === 'in-progress' && (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    )}
                    {step.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    {step.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{step.title}</h4>
                      <Badge variant={
                        step.status === 'completed' ? 'default' :
                        step.status === 'in-progress' ? 'secondary' :
                        step.status === 'error' ? 'destructive' : 'outline'
                      }>
                        {step.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Note about Supabase */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Database className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Connect to Supabase for Full Functionality</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    For real AI generation and text bank integration, connect your project to Supabase. 
                    This demo shows mock question generation.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
                Cancel
              </Button>
              <Button onClick={simulateGeneration} disabled={isGenerating} className="gap-2">
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Test...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Generate Test Questions
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}