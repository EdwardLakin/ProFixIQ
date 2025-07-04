import { InspectionTemplate } from '@lib/inspection/types';

export const MaintenanceInspectionTemplate: InspectionTemplate = {
  templateName: 'Maintenance 50 Point',
  templateId: 'maintenance50',
  sections: [
    {
      section: 'Under Hood',
      title: 'Under Hood',
      items: [
        {
          name: 'Engine Oil', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Coolant Level', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Transmission Fluid', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Fluid', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Power Steering Fluid', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Windshield Washer Fluid', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Battery Condition', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Drive Belts', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    },
    {
      section: 'Under Vehicle',
      title: 'Under Vehicle',
      items: [
        {
          name: 'Oil Leaks', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Transmission Leaks', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Coolant Leaks', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Lines', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Fuel Lines', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Exhaust System', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Suspension Components', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Ball Joints', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Shocks / Struts', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    },
    {
      section: 'Tires & Brakes',
      title: 'Tires & Brakes',
      items: [
        {
          name: 'Tire Pressure (LF)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tire Pressure (RF)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tire Pressure (LR)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tire Pressure (RR)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tread Depth (LF)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tread Depth (RF)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tread Depth (LR)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Tread Depth (RR)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Pads (Front)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Pads (Rear)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Rotors (Front)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Rotors (Rear)', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    },
    {
      section: 'Interior & Exterior',
      title: 'Interior & Exterior',
      items: [
        {
          name: 'All Exterior Lights', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'All Interior Lights', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Wiper Blades', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Washer Operation', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Horn', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'HVAC Operation', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    },
    {
      section: 'Road Test',
      title: 'Road Test',
      items: [
        {
          name: 'Engine Performance', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Transmission Operation', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Steering Feel', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Brake Feel', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Suspension Feel', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Noise or Vibration', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    },
    {
      section: 'Final Checks',
      title: 'Final Checks',
      items: [
        {
          name: 'Check Engine Light', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'TPMS Light', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Fluid Top-Off Needed', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Reset Oil Life Monitor', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Inspection Sticker Valid', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        },
        {
          name: 'Battery Terminals Cleaned', status: 'ok', note: '', value: null,
          notes: '',
          item: ''
        }
      ]
    }
  ]
};
export default MaintenanceInspectionTemplate;