"use client";

import React from "react";
import type { FC } from "react";
import MobileWorkOrderClient from "@/features/work-orders/mobile/MobileWorkOrderClient";

type Props = {
  params: { id: string };
};

const MobileWorkOrderDetailsPage: FC<Props> = ({ params }) => {
  return <MobileWorkOrderClient routeId={params.id} />;
};

export default MobileWorkOrderDetailsPage;