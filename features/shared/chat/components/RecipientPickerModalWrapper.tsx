// features/shared/chat/components/RecipientPickerModalWrapper.tsx
"use client";
import React from "react";
import RecipientPickerModal from "./RecipientPickerModal";

type Props = React.ComponentProps<typeof RecipientPickerModal>;
export default function RecipientPickerModalWrapper(props: Props) {
  return <RecipientPickerModal {...props} />;
}