// lib/inspection/axleTypes.ts

export type BrakeType = 'air' | 'hydraulic';

export interface AxleSideData {
  drumOrRotor: string;
  liningPadThickness: number | null;
  pushRodTravel?: number | null; // only for air brakes
  tirePressure: number | null;
  treadDepth: number | null;
}

export interface AxleInspection {
  axleLabel: string; // e.g. "Steer", "Drive 1", "Drive 2", "Tag", "Trailer 1"
  brakeType: BrakeType;
  left: AxleSideData;
  right: AxleSideData;
  wheelTorqueInner: number | null;
  wheelTorqueOuter: number | null;
  parkBrakeLining?: number | null; // only for axles with parking brake
}