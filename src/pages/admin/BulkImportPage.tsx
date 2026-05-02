import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BulkImport from '@/components/BulkImport';
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BulkImportPage() {
  const navigate = useNavigate();

  const goToQuestionBank = () => {
    navigate('/admin/question-bank');
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-6 w-6" />
            Bulk Import Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BulkImport
            onClose={goToQuestionBank}
            onImportComplete={goToQuestionBank}
          />
        </CardContent>
      </Card>
    </div>
  );
}
