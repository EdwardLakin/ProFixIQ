'use client';

import { useState } from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';
import { analyzeImage } from '@/lib/chatgptHandler';
import ReactMarkdown from 'react-markdown';

export default function PhotoPage() {
  const { vehicleInfo, clearVehicle } = useVehicleInfo();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [chatLog, setChatLog] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setResult('');
    setChatLog([]);
  };

  const handleAnalyze = async () => {
    if (!file || !vehicleInfo) return;

    setLoading(true);
    try {
      const response = await analyzeImage(file, vehicleInfo);
      setResult(response);
      setChatLog([{ role: 'assistant', content: response }]);
    } catch (error) {
      setResult('An error occurred while analyzing the image.');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || !vehicleInfo) return;

    setLoading(true);
    const userMessage = { role: 'user', content: followUp.trim() };
    const history = [...chatLog, userMessage];
    try {
      const response = await analyzeImage(file!, vehicleInfo, history);
      const botMessage = { role: 'assistant', content: response };
      setChatLog(prev => [...prev, userMessage, botMessage]);
      setFollowUp('');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="text-4xl font-header text-accent drop-shadow-md mb-4 text-center">📸 Photo Diagnosis</h1>
      <p className="text-center text-neutral-400 mb-6">
        Upload a photo of a part, leak, or engine bay for AI-powered troubleshooting.
      </p>

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-orange-400">🚗 Vehicle Info</h3>
        <div className="flex gap-2 mt-1 mb-2">
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.year}</div>
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.make}</div>
          <div className="bg-surface border border-neutral-700 px-3 py-1 rounded">{vehicleInfo?.model}</div>
        </div>
        <button onClick={clearVehicle} className="text-sm text-blue-400 underline hover:text-blue-300">
          Change Vehicle
        </button>
      </div>

      <div className="bg-neutral-900 p-4 rounded-md border border-neutral-700 space-y-4 mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="file:bg-blue-600 file:text-white file:px-4 file:py-2 file:rounded-md"
        />
        {file && (
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md w-full"
          >
            Analyze Photo
          </button>
        )}
        {loading && <div className="text-sm text-neutral-500">Analyzing image...</div>}
        {chatLog.length > 0 && (
          <div className="space-y-3">
            {chatLog.map((msg, i) => (
              <div key={i} className={`text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'text-blue-300' : 'text-orange-300'}`}>
                {msg.role === 'assistant' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : <>You: {msg.content}</>}
              </div>
            ))}
          </div>
        )}
        {chatLog.length > 0 && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFollowUp()}
              placeholder="Ask a follow-up question..."
              className="flex-1 p-3 rounded-md bg-surface border border-neutral-700"
            />
            <button
              onClick={handleFollowUp}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md"
            >
              Ask
            </button>
          </div>
        )}
      </div>
    </main>
  );
}