// app/work-orders/create/page.tsx

'use client';

import { v4 as uuidv4 } from 'uuid';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import '@/styles/globals.css';
import supabase from '@lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Customer = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

export default function CreateWorkOrderPage() {
  const searchParams = useSearchParams();
  const template = searchParams.get('template');
  const pageFrom = searchParams.get('pageFrom');

  const [workOrderId, setWorkOrderId] = useState<string>('');

  useEffect(() => {
    const id = uuidv4();
    setWorkOrderId(id);

    if (template && pageFrom === 'inspection') {
      // Save selected template to localStorage for use after work order creation
      localStorage.setItem('selectedInspectionTemplate', template);
    }
  }, [template, pageFrom]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PreviousPageButton to ="/inspection" />
      <h1 className="text-3xl font-black text-center mb-4">Create Work Order</h1>
      <p className="text-center text-sm text-gray-400 mb-8">
        {template ? `Linked to template: ${template}` : 'No inspection linked'}
      </p>

      {/* Your create form logic goes here */}

      <div className="text-sm text-center text-orange-400 mt-12">
        Work Order ID: {workOrderId}
      </div>
    </div>
  );
}