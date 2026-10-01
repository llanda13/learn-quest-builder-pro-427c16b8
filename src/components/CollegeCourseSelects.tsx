import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLLEGES_AND_COURSES, getCoursesForCollege } from '@/constants/colleges';

interface CollegeCourseSelectsProps {
  college: string;
  course: string;
  onCollegeChange: (college: string) => void;
  onCourseChange: (course: string) => void;
  disabled?: boolean;
  collegeLabel?: string;
  courseLabel?: string;
  required?: boolean;
}

/**
 * Cascading College → Course dropdowns. Picking a college resets the course
 * and limits the course options to that college's official list.
 */
export function CollegeCourseSelects({
  college,
  course,
  onCollegeChange,
  onCourseChange,
  disabled,
  collegeLabel = 'College',
  courseLabel = 'Course',
  required,
}: CollegeCourseSelectsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>
          {collegeLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <Select
          value={college}
          onValueChange={(value) => {
            onCollegeChange(value);
            onCourseChange('');
          }}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a college" />
          </SelectTrigger>
          <SelectContent>
            {COLLEGES_AND_COURSES.map((c) => (
              <SelectItem key={c.college} value={c.college}>
                {c.college}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>
          {courseLabel} {required && <span className="text-destructive">*</span>}
        </Label>
        <Select value={course} onValueChange={onCourseChange} disabled={disabled || !college}>
          <SelectTrigger>
            <SelectValue placeholder={college ? 'Select a course' : 'Select a college first'} />
          </SelectTrigger>
          <SelectContent>
            {getCoursesForCollege(college).map((courseName) => (
              <SelectItem key={courseName} value={courseName}>
                {courseName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
