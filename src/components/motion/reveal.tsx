"use client";

import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";

import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

type DivProps = Omit<ComponentProps<typeof motion.div>, "variants" | "children">;

/**
 * Section entrance. One wrapper instead of variant props sprinkled across the
 * app — the reduced-motion branch is handled inside `useMotion`.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  ...props
}: DivProps & { children: ReactNode; delay?: number }) {
  const m = useMotion();
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={m.fadeUp}
      transition={delay ? { delay } : undefined}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Parent of a card grid or list. Children must be `<StaggerItem>`. */
export function Stagger({
  children,
  className,
  ...props
}: DivProps & { children: ReactNode }) {
  const m = useMotion();
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={m.container}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...props
}: DivProps & { children: ReactNode }) {
  const m = useMotion();
  return (
    <motion.div variants={m.item} className={className} {...props}>
      {children}
    </motion.div>
  );
}
