-- Create table of specifications entries table
CREATE TABLE public.tos_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subject_no TEXT NOT NULL,
  course TEXT NOT NULL,
  description TEXT NOT NULL,
  year_section TEXT NOT NULL,
  exam_period TEXT NOT NULL,
  school_year TEXT NOT NULL,
  total_items INTEGER NOT NULL,
  prepared_by TEXT NOT NULL,
  noted_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'teacher'
);

-- Create learning competencies table
CREATE TABLE public.learning_competencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tos_id UUID REFERENCES public.tos_entries(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  hours INTEGER NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  remembering_items INTEGER NOT NULL DEFAULT 0,
  understanding_items INTEGER NOT NULL DEFAULT 0,
  applying_items INTEGER NOT NULL DEFAULT 0,
  analyzing_items INTEGER NOT NULL DEFAULT 0,
  evaluating_items INTEGER NOT NULL DEFAULT 0,
  creating_items INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL,
  item_numbers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create generated tests table
CREATE TABLE public.generated_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tos_id UUID REFERENCES public.tos_entries(id) ON DELETE CASCADE,
  test_title TEXT NOT NULL,
  questions JSONB NOT NULL,
  answer_key JSONB NOT NULL,
  total_questions INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'teacher'
);

-- Enable Row Level Security
ALTER TABLE public.tos_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_tests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tos_entries
CREATE POLICY "TOS entries are viewable by everyone" 
ON public.tos_entries 
FOR SELECT 
USING (true);

CREATE POLICY "TOS entries can be created by everyone" 
ON public.tos_entries 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "TOS entries can be updated by everyone" 
ON public.tos_entries 
FOR UPDATE 
USING (true);

CREATE POLICY "TOS entries can be deleted by everyone" 
ON public.tos_entries 
FOR DELETE 
USING (true);

-- Create RLS policies for learning_competencies
CREATE POLICY "Learning competencies are viewable by everyone" 
ON public.learning_competencies 
FOR SELECT 
USING (true);

CREATE POLICY "Learning competencies can be created by everyone" 
ON public.learning_competencies 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Learning competencies can be updated by everyone" 
ON public.learning_competencies 
FOR UPDATE 
USING (true);

CREATE POLICY "Learning competencies can be deleted by everyone" 
ON public.learning_competencies 
FOR DELETE 
USING (true);

-- Create RLS policies for generated_tests
CREATE POLICY "Generated tests are viewable by everyone" 
ON public.generated_tests 
FOR SELECT 
USING (true);

CREATE POLICY "Generated tests can be created by everyone" 
ON public.generated_tests 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Generated tests can be updated by everyone" 
ON public.generated_tests 
FOR UPDATE 
USING (true);

CREATE POLICY "Generated tests can be deleted by everyone" 
ON public.generated_tests 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_tos_entries_updated_at
BEFORE UPDATE ON public.tos_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();