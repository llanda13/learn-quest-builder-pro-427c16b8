-- Create rubrics table for essay evaluation
CREATE TABLE public.rubrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  grade_level TEXT,
  total_points INTEGER NOT NULL DEFAULT 100,
  criteria JSONB NOT NULL, -- Array of criteria with descriptions and point values
  performance_levels JSONB NOT NULL, -- Array of performance levels (e.g., Excellent, Good, Fair, Poor)
  created_by TEXT NOT NULL DEFAULT 'teacher',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

-- Create policies for rubric access
CREATE POLICY "Rubrics are viewable by everyone" 
ON public.rubrics 
FOR SELECT 
USING (true);

CREATE POLICY "Rubrics can be created by everyone" 
ON public.rubrics 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Rubrics can be updated by everyone" 
ON public.rubrics 
FOR UPDATE 
USING (true);

CREATE POLICY "Rubrics can be deleted by everyone" 
ON public.rubrics 
FOR DELETE 
USING (true);

-- Define the timestamp trigger function before creating triggers that use it.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_rubrics_updated_at
BEFORE UPDATE ON public.rubrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample rubric data
INSERT INTO public.rubrics (title, description, subject, grade_level, total_points, criteria, performance_levels) VALUES
(
  'Essay Writing Rubric',
  'Comprehensive rubric for evaluating essay writing skills',
  'English Language Arts',
  'High School',
  100,
  '[
    {
      "name": "Thesis Statement",
      "description": "Clear, focused, and well-developed thesis statement",
      "points": 20
    },
    {
      "name": "Organization",
      "description": "Logical structure with clear introduction, body, and conclusion",
      "points": 20
    },
    {
      "name": "Evidence and Support",
      "description": "Relevant examples, details, and evidence to support arguments",
      "points": 25
    },
    {
      "name": "Writing Mechanics",
      "description": "Grammar, spelling, punctuation, and sentence structure",
      "points": 15
    },
    {
      "name": "Style and Voice",
      "description": "Appropriate tone, word choice, and writing style",
      "points": 20
    }
  ]',
  '[
    {
      "level": "Excellent",
      "description": "Exceeds expectations",
      "percentage": 90
    },
    {
      "level": "Good",
      "description": "Meets expectations",
      "percentage": 75
    },
    {
      "level": "Fair",
      "description": "Approaching expectations",
      "percentage": 60
    },
    {
      "level": "Poor",
      "description": "Below expectations",
      "percentage": 40
    }
  ]'
);