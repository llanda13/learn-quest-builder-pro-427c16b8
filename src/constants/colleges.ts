// Official list of colleges and their corresponding courses.
// Used by the sign-up form (and anywhere a user picks their college/course)
// so College is chosen first and Course is limited to that college's offerings.

export interface CollegeCourses {
  college: string;
  courses: string[];
}

export const COLLEGES_AND_COURSES: CollegeCourses[] = [
  {
    college: 'College of Agriculture',
    courses: [
      'Bachelor of Science in Agriculture major in Horticulture (BSA Horti)',
      'Bachelor of Science in Agriculture major in Animal Science (BSA AnSci)',
      'Bachelor of Science in Agriculture major in Agronomy (BSA Agron)',
      'Bachelor of Science in Agroforestry (BSAF)',
      'Bachelor of Science in Agribusiness (BS Agrib)',
      'Diploma in Inland Fisheries Technology (DIFT)',
    ],
  },
  {
    college: 'College of Computing and Information Sciences',
    courses: [
      'Bachelor of Science in Information System (BSIS)',
      'Bachelor of Science in Information Technology (BSIT)',
    ],
  },
  {
    college: 'College of Engineering and Industrial Technology',
    courses: [
      'Bachelor of Science in Electronics Engineering (BSECE)',
      'Bachelor of Science in Agricultural and Biosystems Engineering (BSABE)',
      'Bachelor of Science in Civil Engineering (BSCE)',
      'Bachelor of Industrial Technology major in Civil Technology (BIT-CT)',
      'Bachelor of Industrial Technology major in Electronics Technology (BIT-ET)',
      'Bachelor of Industrial Technology major in Welding and Fabrication Technology (BIT-WAFT)',
      'Bachelor of Industrial Technology major in Heating and Ventilating, Refrigeration and Air Conditioning (BIT-HVRAC)',
    ],
  },
  {
    college: 'College of Teacher Education',
    courses: [
      'Bachelor of Elementary Education (BEEd)',
      'Bachelor of Secondary Education major in English (BSEd Eng)',
      'Bachelor of Secondary Education major in Science (BSEd Sci)',
      'Bachelor of Secondary Education major in Mathematics (BSEd Math)',
      'Bachelor of Technology and Livelihood Education major in Industrial Arts (BTLEd IA)',
      'Bachelor of Technology and Livelihood Education major in Agri-Fishery Arts (BTLEd AFA)',
      'Bachelor of Technology and Livelihood Education major in Home Economics (BTLEd HE)',
      'Bachelor of Arts in English Language (ABEL)',
    ],
  },
  {
    college: 'College of Arts and Sciences',
    courses: [
      'Bachelor of Science in Biology (BS Bio)',
      'Bachelor of Science in Applied Mathematics (BSAM)',
      'Bachelor of Science in Environmental Science (BSES)',
    ],
  },
  {
    college: 'College of Business Administration',
    courses: ['Bachelor of Science in Entrepreneurship (BS Entrep)'],
  },
];

export const getCoursesForCollege = (college: string): string[] =>
  COLLEGES_AND_COURSES.find((c) => c.college === college)?.courses ?? [];
