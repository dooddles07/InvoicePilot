"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion";

import { useMotionSafe } from "@/lib/motion";

/**
 * Counts a figure up on mount. Skipped entirely under reduced motion, and the
 * final value is rendered on the server so the number is never missing or
 * wrong before hydration.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const safe = useMotionSafe();
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (!safe || started.current) return;
    started.current = true;
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => setDisplay(value),
    });
    return () => controls.stop();
  }, [safe, value]);

  return (
    <span className={className} suppressHydrationWarning>
      {format(display)}
    </span>
  );
}
