"use client";

import RecipientPickerModal from "./RecipientPickerModal";

type Props = React.ComponentProps<typeof RecipientPickerModal>;

/** Only import THIS from server files/pages/layouts */
export default function RecipientPickerModalWrapper(props: Props) {
  return <RecipientPickerModal {...props} />;
}