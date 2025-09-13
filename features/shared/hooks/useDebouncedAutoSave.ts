import { useEffect, useRef } from "react";

export function useDebouncedAutoSave<T>(
  value: T,
  delay: number,
  save: (v: T) => void | Promise<void>
) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      save(value);
    }, delay);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, delay, save]);
}