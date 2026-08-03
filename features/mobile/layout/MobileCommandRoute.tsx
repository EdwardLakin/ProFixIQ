import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  surface: string;
};

export default function MobileCommandRoute({ children, surface }: Props) {
  return (
    <div
      className={`mobile-command-route mobile-command-route--${surface}`}
      data-mobile-command-surface={surface}
    >
      {children}
    </div>
  );
}
