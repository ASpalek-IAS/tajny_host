"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "./guard";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import type { ChoiceOption, QuestionConfig, QuestionType } from "@/lib/types";

export type Scope = "template" | "inspection";

const T = {
  template: { topics: "template_topics", questions: "template_questions", parent: "template_id" },
  inspection: { topics: "inspection_topics", questions: "inspection_questions", parent: "inspection_id" },
} as const;

function pathFor(scope: Scope, parentId: string) {
  return scope === "template" ? `/admin/sablony/${parentId}` : `/admin/kontroly/${parentId}`;
}

async function assertEditable(scope: Scope, parentId: string) {
  if (scope !== "inspection") return;
  const supabase = await createClient();
  const { data } = await supabase.from("inspections").select("status").eq("id", parentId).single();
  if (!data || !["planned", "assigned"].includes(data.status)) {
    throw new Error("Dotazník lze upravit jen u kontroly, kterou agent ještě nezačal vyplňovat.");
  }
}

async function run(scope: Scope, parentId: string, fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await assertAdmin();
    await assertEditable(scope, parentId);
    await fn();
    revalidatePath(pathFor(scope, parentId));
    if (scope === "inspection") revalidatePath(`/admin/kontroly/${parentId}/dotaznik`);
    return { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function addTopic(scope: Scope, parentId: string, title: string, weight: number) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { data: last } = await db
      .from(T[scope].topics)
      .select("position")
      .eq(T[scope].parent, parentId)
      .order("position", { ascending: false })
      .limit(1);
    const { error } = await db.from(T[scope].topics).insert({
      [T[scope].parent]: parentId,
      title: title.trim() || "Nové téma",
      weight: Math.max(0, weight || 0),
      position: (last?.[0]?.position ?? -1) + 1,
    });
    if (error) throw error;
  });
}

export async function updateTopic(scope: Scope, parentId: string, topicId: string, title: string, weight: number) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { error } = await db
      .from(T[scope].topics)
      .update({ title: title.trim() || "Téma", weight: Math.max(0, weight || 0) })
      .eq("id", topicId);
    if (error) throw error;
  });
}

export async function deleteTopic(scope: Scope, parentId: string, topicId: string) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { error } = await db.from(T[scope].topics).delete().eq("id", topicId);
    if (error) throw error;
  });
}

/** Přesune položku o jedno místo nahoru/dolů (přečísluje celé pořadí). */
async function move(table: string, filterCol: string, filterVal: string, id: string, dir: -1 | 1) {
  const db = await createClient();
  const { data } = await db.from(table).select("id,position").eq(filterCol, filterVal).order("position");
  const rows = data ?? [];
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await Promise.all(rows.map((r, idx) => db.from(table).update({ position: idx }).eq("id", r.id)));
}

export async function moveTopic(scope: Scope, parentId: string, topicId: string, dir: -1 | 1) {
  return run(scope, parentId, () => move(T[scope].topics, T[scope].parent, parentId, topicId, dir));
}

export async function moveQuestion(scope: Scope, parentId: string, topicId: string, questionId: string, dir: -1 | 1) {
  return run(scope, parentId, () => move(T[scope].questions, "topic_id", topicId, questionId, dir));
}

export type QuestionInput = {
  text: string;
  help_text: string;
  type: QuestionType;
  required: boolean;
  weight: number;
  options: ChoiceOption[];
  config: QuestionConfig;
  comment_on_negative: boolean;
};

function clean(q: QuestionInput) {
  const choice = q.type === "single_choice" || q.type === "multi_choice";
  const config: QuestionConfig = {};
  if (q.type === "scale") {
    config.min = Number.isFinite(q.config.min) ? Number(q.config.min) : 1;
    config.max = Number.isFinite(q.config.max) ? Number(q.config.max) : 5;
    if (config.max! <= config.min!) throw new Error("U škály musí být maximum větší než minimum.");
    if (q.config.minLabel) config.minLabel = q.config.minLabel;
    if (q.config.maxLabel) config.maxLabel = q.config.maxLabel;
  }
  if (q.type === "number" || q.type === "duration") {
    if (q.config.threshold !== null && q.config.threshold !== undefined && `${q.config.threshold}` !== "") {
      config.threshold = Number(q.config.threshold);
      config.mode = q.config.mode === "gte" ? "gte" : "lte";
    }
    if (q.type === "number" && q.config.unit) config.unit = q.config.unit;
  }
  const options = choice
    ? q.options
        .filter((o) => o.label.trim())
        .map((o) => ({ id: o.id || crypto.randomUUID().slice(0, 8), label: o.label.trim(), points: Number(o.points) || 0 }))
    : [];
  if (choice && options.length < 2) throw new Error("Zadejte alespoň dvě možnosti.");
  if (!q.text.trim()) throw new Error("Vyplňte text otázky.");
  return {
    text: q.text.trim(),
    help_text: q.help_text.trim() || null,
    type: q.type,
    required: q.required,
    weight: Math.max(0, Number(q.weight) || 0),
    options,
    config,
    comment_on_negative: q.comment_on_negative,
  };
}

export async function addQuestion(scope: Scope, parentId: string, topicId: string, q: QuestionInput) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { data: last } = await db
      .from(T[scope].questions)
      .select("position")
      .eq("topic_id", topicId)
      .order("position", { ascending: false })
      .limit(1);
    const row: Record<string, unknown> = { ...clean(q), topic_id: topicId, position: (last?.[0]?.position ?? -1) + 1 };
    if (scope === "inspection") row.inspection_id = parentId;
    const { error } = await db.from(T[scope].questions).insert(row);
    if (error) throw error;
  });
}

export async function updateQuestion(scope: Scope, parentId: string, questionId: string, q: QuestionInput) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { error } = await db.from(T[scope].questions).update(clean(q)).eq("id", questionId);
    if (error) throw error;
  });
}

export async function deleteQuestion(scope: Scope, parentId: string, questionId: string) {
  return run(scope, parentId, async () => {
    const db = await createClient();
    const { error } = await db.from(T[scope].questions).delete().eq("id", questionId);
    if (error) throw error;
  });
}
