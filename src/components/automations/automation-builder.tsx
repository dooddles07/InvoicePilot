"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FlowCanvas } from "@/components/automations/flow-canvas";
import { NODE_VISUAL } from "@/components/automations/node-visuals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Automation, AutomationNode, AutomationNodeType } from "@/types";

const ADDABLE: AutomationNodeType[] = [
  "delay",
  "condition",
  "email",
  "sms",
  "notification",
  "webhook",
];

const DEFAULT_NODE: Record<AutomationNodeType, { title: string; detail: string }> = {
  trigger: { title: "New trigger", detail: "Choose what starts this sequence" },
  delay: { title: "Wait 1 day", detail: "Business days only" },
  condition: { title: "Check payment status", detail: "Has the balance been settled?" },
  email: { title: "Send email", detail: "Template: Gentle nudge" },
  sms: { title: "Send SMS", detail: "Only if a mobile number exists" },
  notification: { title: "Notify the team", detail: "In-app, normal priority" },
  webhook: { title: "Call a webhook", detail: "POST to your endpoint" },
};

/** Walks the tree including branch children, so the inspector can edit any node. */
function replaceNode(
  nodes: AutomationNode[],
  id: string,
  update: (n: AutomationNode) => AutomationNode,
): AutomationNode[] {
  return nodes.map((n) => {
    if (n.id === id) return update(n);
    if (n.branches) {
      return {
        ...n,
        branches: n.branches.map((b) => ({
          ...b,
          nodes: replaceNode(b.nodes, id, update),
        })),
      };
    }
    return n;
  });
}

function removeNode(nodes: AutomationNode[], id: string): AutomationNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) =>
      n.branches
        ? {
            ...n,
            branches: n.branches.map((b) => ({
              ...b,
              nodes: removeNode(b.nodes, id),
            })),
          }
        : n,
    );
}

function findNode(nodes: AutomationNode[], id: string): AutomationNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    for (const b of n.branches ?? []) {
      const found = findNode(b.nodes, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The builder.
 *
 * The canvas is a view of the sequence; the inspector is where it is edited.
 * That split is what makes the whole thing keyboard-operable — nothing here
 * depends on dragging a node to a pixel.
 */
export function AutomationBuilder({ automation }: { automation: Automation }) {
  const [name, setName] = useState(automation.name);
  const [enabled, setEnabled] = useState(automation.enabled);
  const [nodes, setNodes] = useState<AutomationNode[]>(automation.nodes);
  const [selectedId, setSelectedId] = useState<string | null>(
    automation.nodes[0]?.id ?? null,
  );
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(
    () => (selectedId ? findNode(nodes, selectedId) : undefined),
    [nodes, selectedId],
  );

  const stepCount = useMemo(() => {
    const count = (list: AutomationNode[]): number =>
      list.reduce(
        (sum, n) =>
          sum + 1 + (n.branches ?? []).reduce((s, b) => s + count(b.nodes), 0),
        0,
      );
    return count(nodes);
  }, [nodes]);

  const patch = (id: string, fields: Partial<AutomationNode>) => {
    setNodes((prev) => replaceNode(prev, id, (n) => ({ ...n, ...fields })));
    setDirty(true);
  };

  const addNode = (type: AutomationNodeType) => {
    const next: AutomationNode = {
      id: `nd_${Math.random().toString(36).slice(2, 8)}`,
      type,
      ...DEFAULT_NODE[type],
      ...(type === "condition"
        ? {
            branches: [
              { label: "Yes", nodes: [] },
              { label: "No", nodes: [] },
            ],
          }
        : {}),
    };
    setNodes((prev) => [...prev, next]);
    setSelectedId(next.id);
    setDirty(true);
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="bg-card shadow-e1 rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Label htmlFor="automation-name" className="sr-only">
              Automation name
            </Label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="h-8 max-w-sm font-medium"
            />
          </div>

          <div className="flex items-center gap-3">
            <Label
              htmlFor="automation-enabled"
              className="text-muted-foreground text-caption"
            >
              {enabled ? "Active" : "Paused"}
            </Label>
            <Switch
              id="automation-enabled"
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v === true);
                setDirty(true);
              }}
            />
          </div>
        </div>

        <div className="bg-muted/20 p-4 sm:p-6">
          <FlowCanvas
            nodes={nodes}
            selectedId={selectedId}
            onSelect={(n) => setSelectedId(n.id)}
          />

          <div className="mx-auto mt-3 flex max-w-md justify-center">
            <Select value="" onValueChange={(v) => addNode(v as AutomationNodeType)}>
              <SelectTrigger size="sm" aria-label="Add a step">
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    <Plus className="size-3.5" aria-hidden />
                    Add step
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ADDABLE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {NODE_VISUAL[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5">
          <p className="text-muted-foreground text-caption">
            {stepCount} steps · {automation.runs_30d} runs in the last 30 days
          </p>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setDirty(false);
              toast.success("Automation saved", {
                description: `${name} is ${enabled ? "active" : "paused"} with ${stepCount} steps.`,
              });
            }}
          >
            <Save className="size-3.5" />
            Save changes
          </Button>
        </div>
      </div>

      <aside
        aria-label="Step settings"
        className="bg-card shadow-e1 h-fit rounded-xl border"
      >
        <h2 className="border-b px-4 py-3 text-h3 font-semibold tracking-tight">
          Step settings
        </h2>

        {selected ? (
          <div className="space-y-3 p-4">
            <p className="text-muted-foreground text-caption">
              {NODE_VISUAL[selected.type].label}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="node-title">Title</Label>
              <Input
                id="node-title"
                value={selected.title}
                onChange={(e) => patch(selected.id, { title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-detail">Detail</Label>
              <Input
                id="node-detail"
                value={selected.detail}
                onChange={(e) => patch(selected.id, { detail: e.target.value })}
              />
              <p className="text-muted-foreground text-caption">
                Shown on the card and in the run log, so a teammate can tell what
                this step did without opening it.
              </p>
            </div>

            <Separator />

            <Button
              variant="destructive"
              size="sm"
              disabled={selected.type === "trigger"}
              onClick={() => {
                setNodes((prev) => removeNode(prev, selected.id));
                setSelectedId(null);
                setDirty(true);
              }}
            >
              <Trash2 className="size-3.5" />
              {selected.type === "trigger" ? "Trigger cannot be removed" : "Remove step"}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground p-4 text-small">
            Select a step on the canvas to edit it.
          </p>
        )}
      </aside>
    </div>
  );
}
