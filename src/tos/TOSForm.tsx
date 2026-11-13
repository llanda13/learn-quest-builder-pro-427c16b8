import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Plus, Minus, Calculator } from "lucide-react"
import { TOSConfig } from "@/pages/TOS"
import { TOS } from "@/services/db/tos"

interface TOSFormProps {
  config: TOSConfig
  onConfigChange: (config: TOSConfig) => void
  onGenerate: (config: TOSConfig) => void
}

export function TOSForm({ config, onConfigChange, onGenerate }: TOSFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateConfig = (updates: Partial<TOSConfig>) => {
    onConfigChange({ ...config, ...updates })
  }

  const updateTopic = (index: number, field: 'name' | 'hours', value: string | number) => {
    const newTopics = [...config.topics]
    newTopics[index] = { ...newTopics[index], [field]: value }
    updateConfig({ topics: newTopics })
  }

  const addTopic = () => {
    updateConfig({
      topics: [...config.topics, { name: "", hours: 0 }]
    })
  }

  const removeTopic = (index: number) => {
    const newTopics = config.topics.filter((_, i) => i !== index)
    updateConfig({ topics: newTopics })
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!config.subjectNo.trim()) newErrors.subjectNo = "Subject number is required"
    if (!config.course.trim()) newErrors.course = "Course is required"
    if (!config.description.trim()) newErrors.description = "Description is required"
    if (!config.yearSection.trim()) newErrors.yearSection = "Year and section is required"
    if (!config.examPeriod.trim()) newErrors.examPeriod = "Examination period is required"
    if (!config.schoolYear.trim()) newErrors.schoolYear = "School year is required"
    if (!config.preparedBy.trim()) newErrors.preparedBy = "Prepared by is required"
    if (!config.notedBy.trim()) newErrors.notedBy = "Noted by is required"
    if (config.totalItems < 1) newErrors.totalItems = "Total items must be at least 1"

    // Validate topics
    config.topics.forEach((topic, index) => {
      if (!topic.name.trim()) newErrors[`topic-${index}-name`] = "Topic name is required"
      if (topic.hours <= 0) newErrors[`topic-${index}-hours`] = "Hours must be greater than 0"
    })

    if (config.topics.length === 0) {
      newErrors.topics = "At least one topic is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      await saveTOSToSupabase(config)
      onGenerate(config)
    }
  }

  const saveTOSToSupabase = async (tosConfig: TOSConfig) => {
    try {
      const { supabase } = await import('@/integrations/supabase/client')
      
      // Save TOS entry
      const tosData = {
        title: `${tosConfig.subjectNo} - ${tosConfig.examPeriod} Exam`,
        subject_no: tosConfig.subjectNo,
        course: tosConfig.course,
        description: tosConfig.description,
        year_section: tosConfig.yearSection,
        exam_period: tosConfig.examPeriod,
        school_year: tosConfig.schoolYear,
        total_items: tosConfig.totalItems,
        prepared_by: tosConfig.preparedBy,
        noted_by: tosConfig.notedBy,
        created_by: 'teacher'
      };

      const tosEntry = await TOS.create(tosData);

      // Calculate and save learning competencies
      const totalHours = tosConfig.topics.reduce((sum, topic) => sum + topic.hours, 0)
      let currentItemNumber = 1

      for (const topic of tosConfig.topics) {
        const topicPercentage = (topic.hours / totalHours) * 100
        const topicItems = Math.round(tosConfig.totalItems * (topic.hours / totalHours))
        
        // Bloom's distribution
        const bloomDistribution = {
          remembering: Math.round(topicItems * 0.15),
          understanding: Math.round(topicItems * 0.15),
          applying: Math.round(topicItems * 0.20),
          analyzing: Math.round(topicItems * 0.20),
          evaluating: Math.round(topicItems * 0.15),
          creating: Math.round(topicItems * 0.15)
        }

        // Adjust for rounding
        const calculatedTotal = Object.values(bloomDistribution).reduce((a, b) => a + b, 0)
        if (calculatedTotal !== topicItems) {
          bloomDistribution.applying += (topicItems - calculatedTotal)
        }

        // Generate item numbers
        const itemNumbers = {
          remembering: Array.from({length: bloomDistribution.remembering}, (_, i) => currentItemNumber + i),
          understanding: Array.from({length: bloomDistribution.understanding}, (_, i) => currentItemNumber + bloomDistribution.remembering + i),
          applying: Array.from({length: bloomDistribution.applying}, (_, i) => currentItemNumber + bloomDistribution.remembering + bloomDistribution.understanding + i),
          analyzing: Array.from({length: bloomDistribution.analyzing}, (_, i) => currentItemNumber + bloomDistribution.remembering + bloomDistribution.understanding + bloomDistribution.applying + i),
          evaluating: Array.from({length: bloomDistribution.evaluating}, (_, i) => currentItemNumber + bloomDistribution.remembering + bloomDistribution.understanding + bloomDistribution.applying + bloomDistribution.analyzing + i),
          creating: Array.from({length: bloomDistribution.creating}, (_, i) => currentItemNumber + bloomDistribution.remembering + bloomDistribution.understanding + bloomDistribution.applying + bloomDistribution.analyzing + bloomDistribution.evaluating + i)
        }

        currentItemNumber += topicItems

        const competencyData = {
          tos_id: tosEntry.id,
          topic_name: topic.name,
          hours: topic.hours,
          percentage: topicPercentage,
          remembering_items: bloomDistribution.remembering,
          understanding_items: bloomDistribution.understanding,
          applying_items: bloomDistribution.applying,
          analyzing_items: bloomDistribution.analyzing,
          evaluating_items: bloomDistribution.evaluating,
          creating_items: bloomDistribution.creating,
          total_items: topicItems,
          item_numbers: itemNumbers
        };
        
        await TOS.createLearningCompetencies([competencyData]);

        
      }

      console.log('TOS saved to Supabase successfully')
    } catch (error) {
      console.error('Error saving TOS to Supabase:', error)
    }
  }

  const totalHours = config.topics.reduce((sum, topic) => sum + topic.hours, 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Exam Information */}
      <Card>
        <CardHeader>
          <CardTitle>Examination Information</CardTitle>
          <CardDescription>
            Basic details about the examination and course
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="subjectNo">Subject Number</Label>
              <Input
                id="subjectNo"
                value={config.subjectNo}
                onChange={(e) => updateConfig({ subjectNo: e.target.value })}
                placeholder="e.g., IS 9"
              />
              {errors.subjectNo && <p className="text-sm text-destructive">{errors.subjectNo}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="course">Course</Label>
              <Input
                id="course"
                value={config.course}
                onChange={(e) => updateConfig({ course: e.target.value })}
                placeholder="e.g., BSIS"
              />
              {errors.course && <p className="text-sm text-destructive">{errors.course}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Course Description</Label>
            <Textarea
              id="description"
              value={config.description}
              onChange={(e) => updateConfig({ description: e.target.value })}
              placeholder="e.g., IS 9 - System Analysis and Design"
              rows={2}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="yearSection">Year & Section</Label>
              <Input
                id="yearSection"
                value={config.yearSection}
                onChange={(e) => updateConfig({ yearSection: e.target.value })}
                placeholder="e.g., 3A"
              />
              {errors.yearSection && <p className="text-sm text-destructive">{errors.yearSection}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="examPeriod">Examination Period</Label>
              <Input
                id="examPeriod"
                value={config.examPeriod}
                onChange={(e) => updateConfig({ examPeriod: e.target.value })}
                placeholder="e.g., Final"
              />
              {errors.examPeriod && <p className="text-sm text-destructive">{errors.examPeriod}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="schoolYear">School Year</Label>
              <Input
                id="schoolYear"
                value={config.schoolYear}
                onChange={(e) => updateConfig({ schoolYear: e.target.value })}
                placeholder="e.g., 2024-2025"
              />
              {errors.schoolYear && <p className="text-sm text-destructive">{errors.schoolYear}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalItems">Total Test Items</Label>
            <Input
              id="totalItems"
              type="number"
              min="1"
              value={config.totalItems}
              onChange={(e) => updateConfig({ totalItems: parseInt(e.target.value) || 0 })}
              placeholder="50"
            />
            {errors.totalItems && <p className="text-sm text-destructive">{errors.totalItems}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Topics and Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Topics and Instructional Hours
            <Button type="button" onClick={addTopic} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Topic
            </Button>
          </CardTitle>
          <CardDescription>
            Define the topics and their allocated instructional hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.topics.map((topic, index) => (
            <div key={index} className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`topic-${index}-name`}>Topic Name</Label>
                <Input
                  id={`topic-${index}-name`}
                  value={topic.name}
                  onChange={(e) => updateTopic(index, 'name', e.target.value)}
                  placeholder="e.g., Requirements Engineering"
                />
                {errors[`topic-${index}-name`] && (
                  <p className="text-sm text-destructive">{errors[`topic-${index}-name`]}</p>
                )}
              </div>
              
              <div className="w-32 space-y-2">
                <Label htmlFor={`topic-${index}-hours`}>Hours</Label>
                <Input
                  id={`topic-${index}-hours`}
                  type="number"
                  min="0"
                  value={topic.hours}
                  onChange={(e) => updateTopic(index, 'hours', parseInt(e.target.value) || 0)}
                  placeholder="10"
                />
                {errors[`topic-${index}-hours`] && (
                  <p className="text-sm text-destructive">{errors[`topic-${index}-hours`]}</p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeTopic(index)}
                disabled={config.topics.length === 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {errors.topics && <p className="text-sm text-destructive">{errors.topics}</p>}

          {totalHours > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calculator className="w-4 h-4" />
              <span>Total instructional hours: {totalHours}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preparation Details */}
      <Card>
        <CardHeader>
          <CardTitle>Preparation Details</CardTitle>
          <CardDescription>
            Specify who prepared and reviewed this table of specifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="preparedBy">Prepared By</Label>
              <Input
                id="preparedBy"
                value={config.preparedBy}
                onChange={(e) => updateConfig({ preparedBy: e.target.value })}
                placeholder="Teacher Name"
              />
              {errors.preparedBy && <p className="text-sm text-destructive">{errors.preparedBy}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notedBy">Noted By</Label>
              <Input
                id="notedBy"
                value={config.notedBy}
                onChange={(e) => updateConfig({ notedBy: e.target.value })}
                placeholder="Dean Name"
              />
              {errors.notedBy && <p className="text-sm text-destructive">{errors.notedBy}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" className="gap-2">
          <Calculator className="w-4 h-4" />
          Generate Table of Specifications
        </Button>
      </div>
    </form>
  )
}