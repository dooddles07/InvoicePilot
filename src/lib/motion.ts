"use client";

import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "motion/react";

/**
 * Every animation in InvoicePilot is defined here and nowhere else.
 *
 * Two variant sets exist for each named motion: the full one, and a reduced
 * one that keeps the same *timing contract* (so layout and stagger sequencing
 * still work) while removing all movement. `useMotion()` picks between them,
 * so no component has to remember the accessibility branch.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const springModal: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

const FULL = {
  /** Page and section entrance. Small travel — this is a finance tool, not a deck. */
  fadeUp: {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: EASE_OUT },
    },
  } satisfies Variants,

  /** Parent of a KPI grid or card list. */
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
  } satisfies Variants,

  /** Child of `container`. */
  item: {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.28, ease: EASE_OUT },
    },
  } satisfies Variants,

  /** Dialogs and sheets. */
  modal: {
    hidden: { opacity: 0, scale: 0.97, y: 6 },
    visible: { opacity: 1, scale: 1, y: 0, transition: springModal },
    exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } },
  } satisfies Variants,

  /** Chart series drawing in on range change. */
  draw: {
    hidden: { opacity: 0, pathLength: 0 },
    visible: {
      opacity: 1,
      pathLength: 1,
      transition: { duration: 0.6, ease: EASE_OUT },
    },
  } satisfies Variants,
};

const REDUCED = {
  fadeUp: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.12 } },
  } satisfies Variants,
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.12 } },
  } satisfies Variants,
  modal: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  } satisfies Variants,
  draw: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, pathLength: 1, transition: { duration: 0.12 } },
  } satisfies Variants,
};

export type MotionSet = typeof FULL;

export function useMotion(): MotionSet {
  const reduced = useReducedMotion();
  return useMemo(() => (reduced ? (REDUCED as MotionSet) : FULL), [reduced]);
}

/** True when it is safe to move things. Use for one-off, non-variant motion. */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}
