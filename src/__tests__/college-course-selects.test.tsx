import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CollegeCourseSelects } from '@/components/CollegeCourseSelects';
import { COLLEGES_AND_COURSES, getCoursesForCollege } from '@/constants/colleges';

function Harness() {
  const [college, setCollege] = useState('');
  const [course, setCourse] = useState('');
  return (
    <div>
      <CollegeCourseSelects
        college={college}
        course={course}
        onCollegeChange={setCollege}
        onCourseChange={setCourse}
      />
      <output data-testid="state">{JSON.stringify({ college, course })}</output>
    </div>
  );
}

describe('CollegeCourseSelects', () => {
  it('course dropdown is disabled until a college is chosen', () => {
    render(<Harness />);
    const triggers = screen.getAllByRole('combobox');
    expect(triggers[1]).toBeDisabled();
  });

  it('selecting a college enables course and limits options to that college', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [collegeTrigger, courseTrigger] = screen.getAllByRole('combobox');
    await user.click(collegeTrigger);
    await user.click(screen.getByRole('option', { name: 'College of Computing and Information Sciences' }));
    expect(courseTrigger).toBeEnabled();
    await user.click(courseTrigger);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(getCoursesForCollege('College of Computing and Information Sciences'));
    expect(options).toHaveLength(2);
  });

  it('switching college clears the selected course', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [collegeTrigger, courseTrigger] = screen.getAllByRole('combobox');
    await user.click(collegeTrigger);
    await user.click(screen.getByRole('option', { name: 'College of Computing and Information Sciences' }));
    await user.click(courseTrigger);
    await user.click(screen.getByRole('option', { name: 'Bachelor of Science in Information Technology (BSIT)' }));
    expect(screen.getByTestId('state').textContent).toContain('BSIT');
    await user.click(collegeTrigger);
    await user.click(screen.getByRole('option', { name: 'College of Business Administration' }));
    const state = JSON.parse(screen.getByTestId('state').textContent!);
    expect(state.college).toBe('College of Business Administration');
    expect(state.course).toBe('');
  });

  it('official list has 6 colleges and every course is non-empty', () => {
    expect(COLLEGES_AND_COURSES).toHaveLength(6);
    for (const c of COLLEGES_AND_COURSES) {
      expect(c.courses.length).toBeGreaterThan(0);
      for (const course of c.courses) expect(course.trim()).not.toBe('');
    }
  });
});
