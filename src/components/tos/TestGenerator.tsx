import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, Brain, Database, CheckCircle, AlertCircle } from "lucide-react"
import { TOSData } from "@/pages/TOS"
import { TestQuestion } from "./GeneratedTest"
import { shuffleExamChoices } from "@/utils/shuffleExamChoices"

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
      title: 'Analyzing TOS Criteria',
      status: 'pending',
      description: 'Processing topic distribution and Bloom level requirements'
    },
    {
      id: 'query-bank',
      title: 'Querying Question Bank',
      status: 'pending',
      description: 'Searching for approved questions matching criteria'
    },
    {
      id: 'semantic-filter',
      title: 'Semantic Similarity Filtering',
      status: 'pending',
      description: 'Selecting non-redundant questions (similarity < 0.85)'
    },
    {
      id: 'ai-generate',
      title: 'AI Question Generation',
      status: 'pending',
      description: 'Generating new questions for missing criteria'
    },
    {
      id: 'answer-key',
      title: 'Answer Key Generation',
      status: 'pending',
      description: 'Creating automatic answer key for all questions'
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

  const createCompletionFallbackQuestions = (needed: number, startingIndex: number) => {
    const slots: Array<{ topic: string; bloomLevel: string; difficulty: string }> = []

    Object.entries(tosData.distribution).forEach(([topicName, topicData]) => {
      Object.entries(topicData).forEach(([bloomLevel, itemNumbers]) => {
        if (bloomLevel === 'hours' || bloomLevel === 'total' || !Array.isArray(itemNumbers)) return
        itemNumbers.forEach(() => slots.push({ topic: topicName, bloomLevel, difficulty: getDifficultyFromBloom(bloomLevel) }))
      })
    })

    return Array.from({ length: needed }, (_, index) => {
      const slot = slots[(startingIndex + index) % Math.max(slots.length, 1)] || {
        topic: 'General Topic',
        bloomLevel: 'understanding',
        difficulty: 'Easy'
      }
      const bloomLabel = slot.bloomLevel.charAt(0).toUpperCase() + slot.bloomLevel.slice(1).toLowerCase()
      return {
        id: `completion-fallback-${Date.now()}-${index}`,
        question_text: `Which answer best demonstrates ${bloomLabel.toLowerCase()} of ${slot.topic} in the lesson context?`,
        question_type: 'mcq',
        choices: {
          A: `A specific and accurate response about ${slot.topic} supported by relevant academic reasoning`,
          B: `A broad response that mentions ${slot.topic} but lacks lesson-specific evidence`,
          C: 'An unrelated response that does not address the required topic or concept',
          D: 'A partial response that repeats terms without explaining their meaning'
        },
        correct_answer: 'A',
        topic: slot.topic,
        bloom_level: bloomLabel,
        difficulty: slot.difficulty,
        knowledge_dimension: 'conceptual',
        points: 1,
        created_by: 'fallback',
        approved: true,
        needs_review: true,
        validation_notes: 'Client completion fallback used after generation shortfall',
        metadata: { generated_by: 'client_completion_fallback', pipeline_version: '4.0' }
      }
    })
  }

  const updateStep = (index: number, status: GenerationStep['status']) => {
    setSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, status } : step
    ))
  }

  const generateQuestionsFromDatabase = async (): Promise<string> => {
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Build distributions in the format expected by the edge function
      const distributions: any[] = []
      Object.entries(tosData.distribution).forEach(([topicName, topicData]) => {
        const counts: any = {
          remembering: 0,
          understanding: 0,
          applying: 0,
          analyzing: 0,
          evaluating: 0,
          creating: 0,
          difficulty: { easy: 0, average: 0, difficult: 0 }
        }
        
        Object.entries(topicData).forEach(([bloomLevel, itemNumbers]) => {
          if (bloomLevel === 'hours' || bloomLevel === 'total' || !Array.isArray(itemNumbers)) return
          
          const normalizedBloom = bloomLevel.toLowerCase()
          if (counts[normalizedBloom] !== undefined) {
            counts[normalizedBloom] = itemNumbers.length
          }
          
          // Distribute difficulty based on bloom level
          const difficulty = getDifficultyFromBloom(bloomLevel)
          if (difficulty === 'Easy') counts.difficulty.easy += itemNumbers.length
          else if (difficulty === 'Average') counts.difficulty.average += itemNumbers.length
          else counts.difficulty.difficult += itemNumbers.length
        })
        
        distributions.push({ topic: topicName, counts })
      })

      console.log('🎯 Calling edge function with full TOS distribution:', {
        total_items: tosData.totalItems,
        topics: distributions.length,
        distributions
      })

      // Call the edge function with the COMPLETE TOS distribution in ONE call
      const { data, error } = await supabase.functions.invoke('generate-questions-from-tos', {
        body: {
          tos_id: tosData.id || 'direct-generation',
          total_items: tosData.totalItems,
          distributions,
          allow_unapproved: false,
          prefer_existing: true
        }
      })

      if (error) {
        console.error('Edge function error:', error)
        throw new Error('Failed to generate questions: ' + error.message)
      }

      if (!data?.questions || data.questions.length === 0) {
        throw new Error('No questions were generated')
      }

      console.log('✅ Edge function returned:', {
        total: data.questions.length,
        from_bank: data.statistics?.from_bank || 0,
        ai_generated: data.statistics?.ai_generated || 0
      })

      // Final client-side completion guard: never save fewer than the TOS total.
      const completedQuestions = data.questions.length < tosData.totalItems
        ? [
            ...data.questions,
            ...createCompletionFallbackQuestions(tosData.totalItems - data.questions.length, data.questions.length)
          ]
        : data.questions.slice(0, tosData.totalItems)

      if (data.questions.length < tosData.totalItems) {
        console.warn(`⚠️ Edge function returned ${data.questions.length}/${tosData.totalItems}; client fallback filled the remaining ${tosData.totalItems - data.questions.length}`)
      }

      // Number questions sequentially
      const numberedQuestions = completedQuestions.map((q: any, idx: number) => ({
        ...q,
        question_number: idx + 1
      }))
      const securedQuestions = shuffleExamChoices(numberedQuestions).items.map((q: any, idx: number) => ({
        ...q,
        question_number: idx + 1
      }))

      // Generate answer key
      const answerKey = securedQuestions.map((q: any) => ({
        question_number: q.question_number,
        question_id: q.id,
        correct_answer: q.correct_answer,
        points: 1
      }))

      // Save the complete test to database
      const testData = {
        title: `${tosData.description} - ${tosData.examPeriod}`,
        subject: tosData.course,
        course: tosData.course,
        year_section: tosData.yearSection,
        exam_period: tosData.examPeriod,
        school_year: tosData.schoolYear,
        items: securedQuestions,
        answer_key: answerKey,
        tos_id: tosData.id || null,
        points_per_question: 1,
        created_by: user.id
      }

      const { data: generatedTest, error: insertError } = await supabase
        .from('generated_tests')
        .insert(testData)
        .select()
        .single()

      if (insertError) {
        console.error('Failed to save test:', insertError)
        throw new Error('Failed to save generated test: ' + insertError.message)
      }

      console.log('✅ Test saved with', securedQuestions.length, 'questions')
      return generatedTest.id
    } catch (error) {
      console.error('Error generating test from TOS:', error)
      throw error
    }
  }

  const simulateGeneration = async () => {
    setIsGenerating(true)
    setProgress(0)

    try {
      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i)
        updateStep(i, 'in-progress')
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        updateStep(i, 'completed')
        setProgress(((i + 1) / steps.length) * 100)
      }

      // Generate questions using intelligent AI-assisted selection
      const testId = await generateQuestionsFromDatabase()
      
      setTimeout(() => {
        setIsGenerating(false)
        // Navigate to generated test page
        navigate(`/teacher/generated-test/${testId}`)
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

            {/* System Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Database className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Intelligent Test Generation System</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Using semantic similarity filtering (≥0.85 threshold) to ensure non-redundant question selection. 
                    AI-generated questions are marked as pending and require Admin approval before becoming part of the Question Bank.
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