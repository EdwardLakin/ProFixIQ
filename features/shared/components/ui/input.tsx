import * as React from "react";
import { cn } from "@shared/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border px-3 py-2 text-sm text-white",
          "border-white/10 bg-black/30 backdrop-blur-sm",
          "placeholder:text-neutral-500",
          "focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.45)] focus:border-[color:var(--accent-copper-soft,#fdba74)]",
          "transition-all duration-200 ease-in-out",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
