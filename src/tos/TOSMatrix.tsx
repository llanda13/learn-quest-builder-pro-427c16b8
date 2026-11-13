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

  return (
    <div className="bg-white text-black print:shadow-none" id="tos-document">
      {/* Official Document Header */}
      <div className="border-2 border-black mb-4 print:mb-2">
        {/* Institution Header */}
        <div className="flex items-start gap-4 p-4 border-b border-black">
          <div className="w-20 h-20 flex items-center justify-center" style={{ background: '#ffffff' }}>
            <img src="/images/institution-logo.png" alt="Logo" className="w-20 h-20 object-contain" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold uppercase">
              AGUSAN DEL SUR STATE COLLEGE OF AGRICULTURE AND TECHNOLOGY
            </div>
            <div className="text-sm">
              Bunawan, Agusan del Sur<br/>
              website: http://asscat.edu.ph<br/>
              email address: op@asscat.edu.ph; mobile no.: +639486379266
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="grid grid-cols-2 gap-2 border border-black">
              <div className="p-1 border-r border-black font-semibold">Doc No.</div>
              <div className="p-1">F-DOI-009</div>
              <div className="p-1 border-r border-t border-black font-semibold">Effective Date:</div>
              <div className="p-1 border-t border-black">{new Date().toLocaleDateString()}</div>
              <div className="p-1 border-r border-t border-black font-semibold">Rev. No.</div>
              <div className="p-1 border-t border-black">1</div>
              <div className="p-1 border-r border-t border-black font-semibold">Page No.</div>
              <div className="p-1 border-t border-black">1 of 1</div>
            </div>
          </div>
        </div>

        {/* Document Title */}
        <div className="text-center py-3 bg-gray-100 border-b border-black">
          <h1 className="text-xl font-bold uppercase">TWO-WAY TABLE OF SPECIFICATION</h1>
        </div>

        {/* Course Information */}
        <div className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <div><span className="font-semibold">College:</span> College of Computing and Information Sciences</div>
              <div><span className="font-semibold">Subject No.:</span> {data.subjectNo}</div>
              <div><span className="font-semibold">Description:</span> {data.description}</div>
            </div>
            <div className="space-y-1">
              <div><span className="font-semibold">Examination Period:</span> {data.examPeriod}</div>
              <div><span className="font-semibold">Year and Section:</span> {data.yearSection}</div>
              <div><span className="font-semibold">Course:</span> {data.course}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Official TOS Table */}
      <div className="border-2 border-black">
        <table className="w-full border-collapse">
          <thead>
            {/* Main Header Row */}
            <tr style={{ backgroundColor: '#91E291' }}>
              <th rowSpan={3} className="border border-black p-2 font-bold text-center w-48">TOPIC</th>
              <th rowSpan={3} className="border border-black p-2 font-bold text-center w-24">NO. OF HOURS</th>
              <th rowSpan={3} className="border border-black p-2 font-bold text-center w-24">PERCENTAGE</th>
              <th colSpan={6} className="border border-black p-2 font-bold text-center">COGNITIVE DOMAINS</th>
              <th rowSpan={3} className="border border-black p-2 font-bold text-center w-24">ITEM PLACEMENT</th>
              <th rowSpan={3} className="border border-black p-2 font-bold text-center w-20">TOTAL</th>
            </tr>
            {/* Difficulty Level Row */}
            <tr style={{ backgroundColor: '#91E291' }}>
              <th colSpan={2} className="border border-black p-1 font-bold text-center">EASY (30%)</th>
              <th colSpan={2} className="border border-black p-1 font-bold text-center">AVERAGE (40%)</th>
              <th colSpan={2} className="border border-black p-1 font-bold text-center">DIFFICULT (30%)</th>
            </tr>
            {/* Bloom's Taxonomy Row */}
            <tr style={{ backgroundColor: '#91E291' }}>
              {bloomLevels.map((level) => (
                <th key={level.key} className="border border-black p-1 font-bold text-center text-xs">
                  <div>{level.label}</div>
                  <div>({level.percentage})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.distribution).map(([topicName, topicData]) => {
              const topicPercentage = Math.round((topicData.hours / totalHours) * 100);
              return (
                <tr key={topicName}>
                  <td className="border border-black p-2 font-medium">{topicName}</td>
                  <td className="border border-black p-2 text-center">{topicData.hours} hours</td>
                  <td className="border border-black p-2 text-center">{topicPercentage}%</td>
                  {bloomLevels.map((level) => (
                    <td key={level.key} className="border border-black p-2 text-center">
                      <div className="font-semibold">{topicData[level.key].length}</div>
                      <div className="text-xs mt-1">
                        {formatItemNumbers(topicData[level.key])}
                      </div>
                    </td>
                  ))}
                  <td className="border border-black p-2 text-center font-semibold">I</td>
                  <td className="border border-black p-2 text-center font-bold">{topicData.total}</td>
                </tr>
              );
            })}
            
            {/* Total Row */}
            <tr className="bg-gray-100 font-bold">
              <td className="border border-black p-2 font-bold text-center">TOTAL</td>
              <td className="border border-black p-2 text-center">{totalHours}</td>
              <td className="border border-black p-2 text-center">100%</td>
              {bloomLevels.map((level) => (
                <td key={level.key} className="border border-black p-2 text-center font-bold">
                  {bloomTotals[level.key]}
                </td>
              ))}
              <td className="border border-black p-2 text-center">-</td>
              <td className="border border-black p-2 text-center font-bold text-lg">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature Section */}
      <div className="mt-8 flex justify-between">
        <div className="text-center" style={{ width: '30%' }}>
          <div className="font-semibold mb-5">Prepared by:</div>
          <div className="font-bold uppercase border-b border-black inline-block min-w-[160px] pb-0.5">
            {data.preparedBy || '\u00A0'}
          </div>
          <div className="text-sm italic">Instructor</div>
        </div>
        <div className="text-center" style={{ width: '30%' }}>
          <div className="font-semibold mb-5">Checked and Reviewed by:</div>
          <div className="font-bold uppercase border-b border-black inline-block min-w-[160px] pb-0.5">
            {data.checkedBy || '\u00A0'}
          </div>
          <div className="text-sm italic">Program Chair</div>
        </div>
        <div className="text-center" style={{ width: '30%' }}>
          <div className="font-semibold mb-5">Approved by:</div>
          <div className="font-bold uppercase border-b border-black inline-block min-w-[160px] pb-0.5">
            {data.notedBy || '\u00A0'}
          </div>
          <div className="text-sm italic">Dean</div>
        </div>
      </div>
    </div>
  )
}