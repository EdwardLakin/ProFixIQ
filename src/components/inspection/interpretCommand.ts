import { OpenAI } from 'openai';
import { InspectionSession } from '@lib/inspection/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const interpretCommand = async (transcript: string, session: InspectionSession) => {
  const prompt = `
You're helping an auto inspection system interpret technician voice commands.
The format is strict JSON. Given the following command: "${transcript}",
return a structured action.

Session state: ${JSON.stringify({
    currentSection: session.sections[session.currentSectionIndex]?.title,
    currentItem: session.sections[session.currentSectionIndex]?.items[session.currentItemIndex]?.item,
  })}

Respond with:
{
  "action": "updateItem",
  "sectionIndex": 0,
  "itemIndex": 2,
  "status": "fail",
  "value": "2mm",
  "notes": "from front brakes",
  "photoUrl": ""
}
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You interpret voice commands for vehicle inspections.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  });

  try {
    const codeBlock = res.choices[0].message.content?.match(/```json?\n([\s\S]*?)\n```/);
    const json = codeBlock ? JSON.parse(codeBlock[1]) : JSON.parse(res.choices[0].message.content || '{}');
    return json;
  } catch (err) {
    console.error('Failed to parse OpenAI response:', err);
    return null;
  }
};

export default interpretCommand;