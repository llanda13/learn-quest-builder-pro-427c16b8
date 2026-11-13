import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TOSData } from "@/pages/TOS"

interface TOSMatrixProps {
  data: TOSData
}

export function TOSMatrix({ data }: TOSMatrixProps) {
  const bloomLevels = [
    { key: 'remembering', label: 'Remembering', difficulty: 'Easy', percentage: '15%' },
    { key: 'understanding', label: 'Understanding', difficulty: 'Easy', percentage: '15%' },
    { key: 'applying', label: 'Applying', difficulty: 'Average', percentage: '20%' },
    { key: 'analyzing', label: 'Analyzing', difficulty: 'Average', percentage: '20%' },
    { key: 'evaluating', label: 'Evaluating', difficulty: 'Difficult', percentage: '15%' },
    { key: 'creating', label: 'Creating', difficulty: 'Difficult', percentage: '15%' }
  ] as const

  const formatItemNumbers = (items: number[]) => {
    if (items.length === 0) return ''
    if (items.length === 1) return `(${items[0]})`
    
    // Group consecutive numbers
    const groups: string[] = []
    let start = items[0]
    let end = items[0]
    
    for (let i = 1; i < items.length; i++) {
      if (items[i] === end + 1) {
        end = items[i]
      } else {
        groups.push(start === end ? start.toString() : `${start},${end}`)
        start = end = items[i]
      }
    }
    groups.push(start === end ? start.toString() : `${start},${end}`)
    
    return `(${groups.join(',')})`
  }

  // Calculate totals for each Bloom level
  const bloomTotals = bloomLevels.reduce((acc, level) => {
    acc[level.key] = Object.values(data.distribution).reduce((sum, topic) => {
      return sum + topic[level.key].length
    }, 0)
    return acc
  }, {} as Record<string, number>)

  const grandTotal = Object.values(bloomTotals).reduce((sum, count) => sum + count, 0)

  // Calculate topic percentages based on hours
  const totalHours = Object.values(data.distribution).reduce((sum, topic) => sum + topic.hours, 0)


}