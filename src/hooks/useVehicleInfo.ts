'use client'

import react, { createContent, useContext, useState } from 'react';

export function useVehicleInfo(){
    const [vehicle, setVehicle] = useState(null);
    return { vehicle, setVehicle };
}