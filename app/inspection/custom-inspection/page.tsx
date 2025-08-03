'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { Button } from '@components/ui/Button';
import { Textarea } from '@components/ui/textarea';
import { Input } from '@components/ui/input';
import InspectionGroupList from '@components/InspectionGroupList';
import { InspectionCategory } from '@lib/inspection/masterInspectionList';

type SavedInspection = {
  id: string;
  name: string;
  categories: InspectionCategory[];
};

export default function CustomInspectionPage() {
  const supabase = createClientComponentClient<Database>();
  const [input, setInput] = useState('');
  const [inspection, setInspection] = useState<InspectionCategory[]>([]);
  const [savedInspections, setSavedInspections] = useState<SavedInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        loadSavedInspections(user.id);
      }
    };
    getUser();
  }, []);

  const generateInspection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });
      const data = await res.json();
      setInspection(data.categories);
    } catch (err) {
      console.error('Error generating inspection:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!userId || !templateName || inspection.length === 0) return;
    const { error } = await supabase.from('inspection_templates').insert([
      {
        user_id: userId,
        name: templateName,
        categories: inspection,
      },
    ]);
    if (error) console.error('Save error:', error.message);
    else loadSavedInspections(userId);
  };

  const loadSavedInspections = async (userId: string) => {
    const { data, error } = await supabase
      .from('inspection_templates')
      .select('id, name, categories')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) console.error('Load error:', error.message);
    else setSavedInspections(data || []);
  };

  const loadTemplate = (template: SavedInspection) => {
    setInspection(template.categories);
    setTemplateName(template.name);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from('inspection_templates').delete().eq('id', id);
    if (error) console.error('Delete error:', error.message);
    else loadSavedInspections(userId!);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-white">Custom Inspection Generator</h1>

      <Textarea
        placeholder="e.g. Create an inspection for brakes, lights, and fluids"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full text-black"
        rows={4}
      />
      <Button onClick={generateInspection} disabled={loading} className="mt-4">
        {loading ? 'Generating...' : 'Generate Inspection'}
      </Button>

      {inspection.length > 0 && (
        <div className="mt-6">
          <Input
            className="text-black w-full mb-2"
            placeholder="Name your template"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Button onClick={saveTemplate}>Save Template</Button>

          <div className="mt-8">
            <InspectionGroupList categories={inspection} editable />
          </div>
        </div>
      )}

      {savedInspections.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-semibold text-white mb-2">Saved Templates</h2>
          <ul className="space-y-2">
            {savedInspections.map((template) => (
              <li
                key={template.id}
                className="bg-gray-800 p-4 rounded flex justify-between items-center"
              >
                <span className="text-white font-medium">{template.name}</span>
                <div className="space-x-2">
                  <Button onClick={() => loadTemplate(template)}>Load</Button>
                  <Button variant="destructive" onClick={() => deleteTemplate(template.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}