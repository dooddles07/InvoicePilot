"use client";

import { motion } from "motion/react";
import { Fragment } from "react";

import { NODE_VISUAL } from "@/components/automations/node-visuals";
import { useMotion, useMotionSafe } from "@/lib/motion";
import type { AutomationNode } from "@/types";
import { cn } from "@/lib/utils";

/**
 * A collection sequence is linear, so the canvas is a vertical flow rather
 * than a free-positioned graph: the shape carries the meaning (this, then
 * this, then if-unpaid-then-that) and every node stays a real button in the
 * tab order. Branches fan out once, under a condition, and rejoin visually.
 */
export function FlowCanvas({
  nodes,
  selectedId,
  onSelect,
  compact = false,
}: {
  nodes: AutomationNode[];
  selectedId?: string | null;
  onSelect?: (node: AutomationNode) => void;
  compact?: boolean;
}) {
  return (
    <ol className="flex flex-col items-stretch gap-0">
      {nodes.map((node, i) => (
        <Fragment key={node.id}>
          <li>
            <NodeCard
              node={node}
              index={i}
              selected={selectedId === node.id}
              onSelect={onSelect}
              compact={compact}
            />
          </li>

          {node.branches ? (
            <li>
              <BranchFan
                branches={node.branches}
                selectedId={selectedId}
                onSelect={onSelect}
                compact={compact}
              />
            </li>
          ) : i < nodes.length - 1 ? (
            <li aria-hidden>
              <Connector delay={i * 0.08} />
            </li>
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}

function NodeCard({
  node,
  index,
  selected,
  onSelect,
  compact,
}: {
  node: AutomationNode;
  index: number;
  selected: boolean;
  onSelect?: (node: AutomationNode) => void;
  compact: boolean;
}) {
  const m = useMotion();
  const visual = NODE_VISUAL[node.type];
  const Icon = visual.icon;

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg ring-1",
          visual.tile,
          visual.ring,
          compact ? "size-7" : "size-9",
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-4"} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="text-muted-foreground block text-caption">
          {visual.label}
        </span>
        <span
          className={cn(
            "block truncate font-medium",
            compact ? "text-caption" : "text-small",
          )}
        >
          {node.title}
        </span>
        {!compact ? (
          <span className="text-muted-foreground block truncate text-caption">
            {node.detail}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={m.item}
      transition={{ delay: index * 0.05 }}
      className="mx-auto w-full max-w-md"
    >
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(node)}
          aria-pressed={selected}
          className={cn(
            "bg-card shadow-e1 focus-visible:ring-ring flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
            "hover:border-brand/40 hover:bg-muted/40",
            selected && "border-brand ring-brand/25 ring-2",
          )}
        >
          {body}
        </button>
      ) : (
        <div className="bg-card shadow-e1 flex w-full items-center gap-3 rounded-xl border p-3">
          {body}
        </div>
      )}
    </motion.div>
  );
}

/**
 * The line between two steps. Drawn, not implied — it is the sequence.
 *
 * A plain element rather than an SVG: a vertical rule stretched through a
 * `preserveAspectRatio="none"` viewBox scales its stroke on both axes, which
 * is how you end up with a connector that is either invisible or a smear.
 */
function Connector({ delay = 0, label }: { delay?: number; label?: string }) {
  const safe = useMotionSafe();
  return (
    <div
      aria-hidden
      className="relative mx-auto flex h-8 w-full max-w-md items-center justify-center"
    >
      <motion.span
        className="bg-muted-foreground/35 absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full"
        style={{ originY: 0 }}
        initial={safe ? { scaleY: 0 } : false}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      />
      {label ? (
        <span className="bg-background text-muted-foreground relative rounded-full border px-2 py-0.5 text-caption">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function BranchFan({
  branches,
  selectedId,
  onSelect,
  compact,
}: {
  branches: NonNullable<AutomationNode["branches"]>;
  selectedId?: string | null;
  onSelect?: (node: AutomationNode) => void;
  compact: boolean;
}) {
  return (
    <div>
      <Connector />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {branches.map((branch) => (
          <div
            key={branch.label}
            className="bg-muted/30 space-y-0 rounded-xl border border-dashed p-2"
          >
            <p className="text-muted-foreground px-1 pb-1.5 text-caption font-medium">
              If {branch.label.toLowerCase()}
            </p>
            <FlowCanvas
              nodes={branch.nodes}
              selectedId={selectedId}
              onSelect={onSelect}
              compact={compact}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
