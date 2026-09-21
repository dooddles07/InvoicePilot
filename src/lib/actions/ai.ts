"use server";

import { z } from "zod";

import { ApiError } from "@/lib/api/client";
import { postAsk } from "@/lib/api/ai";
import type { AIAnswer } from "@/types";

export type AskResult = { ok: true; answer: AIAnswer } | { ok: false; message: string };

const questionSchema = z.string().trim().min(1).max(500);

export async function askInvoicePilot(question: unknown): Promise<AskResult> {
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) return { ok: false, message: "Ask a question first." };

  try {
    return { ok: true, answer: await postAsk(parsed.data) };
  } catch (error) {
    if (error instanceof ApiError && error.status !== 500) {
      return { ok: false, message: error.detail };
    }
    return { ok: false, message: "Could not reach InvoicePilot. Try again." };
  }
}
