"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice, cx } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { saveAnswer, saveExpense, saveVisitAt, submitInspection } from "@/lib/answer-actions";
import { questionFraction, type Answer, type Question, type Topic } from "@/lib/types";
import { toLocalInput } from "@/lib/format";
import { clearDraft, draftSize, readDraft, writeDraft, type Draft } from "@/lib/offline-draft";

type FileItem = {
  id: string;
  question_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  url: string | null;
};

type Missing = { question_id: string | null; reason: string };

export function InspectionForm({
  inspectionId,
  mode,
  topics,
  questions,
  answers,
  attachments,
  visitAt,
  expense = null,
}: {
  inspectionId: string;
  mode: "agent" | "admin";
  topics: Topic[];
  questions: Question[];
  answers: Record<string, Answer>;
  attachments: FileItem[];
  visitAt: string | null;
  /** útrata v Kč – vyplňuje jen agent (správce ji upravuje v detailech kontroly) */
  expense?: number | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(Object.values(answers).map((a) => [a.question_id, a.value])),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.values(answers).map((a) => [a.question_id, a.comment ?? ""])),
  );
  const [files, setFiles] = useState<FileItem[]>(attachments);
  const [visit, setVisit] = useState(toLocalInput(visitAt));
  const [spent, setSpent] = useState(expense === null ? "" : String(expense).replace(".", ","));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [submitting, startSubmit] = useTransition();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [restored, setRestored] = useState(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef(0);
  // Záloha neodeslaných změn – drží se v paměti i v localStorage
  const draft = useRef<Draft>({ answers: {} });
  const flushing = useRef(false);
  // Pořadové číslo změny (rozliší, jestli se odpověď mezi odesláním a odpovědí serveru znovu změnila)
  const seq = useRef(0);
  useEffect(() => {
    seq.current = Date.now();
  }, []);

  const storeDraft = useCallback(() => {
    writeDraft(inspectionId, draft.current);
    setPendingCount(draftSize(draft.current));
  }, [inspectionId]);

  /** Pošle na server jednu odpověď ze zálohy. Vrací false při výpadku sítě. */
  const pushAnswer = useCallback(
    async (qid: string): Promise<boolean> => {
      const item = draft.current.answers[qid];
      if (!item) return true;
      inFlight.current++;
      setSaveState("saving");
      try {
        const r = await saveAnswer(qid, item.value, item.comment);
        // server odpověděl – záznam ze zálohy odstraníme, pokud se mezitím nezměnil
        if (draft.current.answers[qid]?.t === item.t) delete draft.current.answers[qid];
        storeDraft();
        if (r.error) {
          setError(r.error);
          setSaveState("error");
        }
        setOnline(true);
        return true;
      } catch {
        setOnline(false);
        return false;
      } finally {
        inFlight.current--;
        if (inFlight.current === 0) {
          setSaveState((st) => (st === "error" ? st : Object.keys(draft.current.answers).length ? "idle" : "saved"));
        }
      }
    },
    [storeDraft],
  );

  const pushVisit = useCallback(async (): Promise<boolean> => {
    const item = draft.current.visit;
    if (!item) return true;
    try {
      const r = await saveVisitAt(inspectionId, item.value);
      if (draft.current.visit?.t === item.t) delete draft.current.visit;
      storeDraft();
      if (r.error) setError(r.error);
      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    }
  }, [inspectionId, storeDraft]);

  const pushExpense = useCallback(async (): Promise<boolean> => {
    const item = draft.current.expense;
    if (!item) return true;
    try {
      const r = await saveExpense(inspectionId, item.value);
      if (draft.current.expense?.t === item.t) delete draft.current.expense;
      storeDraft();
      if (r.error) setError(r.error);
      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    }
  }, [inspectionId, storeDraft]);

  /** Odešle všechno, co je v záloze. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      if (!(await pushVisit())) return;
      if (!(await pushExpense())) return;
      for (const qid of Object.keys(draft.current.answers)) {
        if (timers.current[qid]) continue; // ještě se píše, odešle se samo
        if (!(await pushAnswer(qid))) return;
      }
    } finally {
      flushing.current = false;
    }
  }, [pushAnswer, pushVisit, pushExpense]);

  // Po otevření: obnovit neodeslané změny ze zálohy a zkusit je poslat
  useEffect(() => {
    const d = readDraft(inspectionId);
    draft.current = d;
    const qids = Object.keys(d.answers);
    if (draftSize(d)) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setValues((s) => ({ ...s, ...Object.fromEntries(qids.map((q) => [q, d.answers[q].value])) }));
      setComments((s) => ({ ...s, ...Object.fromEntries(qids.map((q) => [q, d.answers[q].comment])) }));
      if (d.visit) setVisit(toLocalInput(d.visit.value));
      if (d.expense) setSpent(d.expense.value === null ? "" : String(d.expense.value).replace(".", ","));
      setRestored(draftSize(d));
      setPendingCount(draftSize(d));
      /* eslint-enable react-hooks/set-state-in-effect */
      flush();
    }
  }, [inspectionId, flush]);

  // Při návratu připojení a pravidelně každých 15 s dosílat zálohu
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const iv = setInterval(() => {
      if (draftSize(draft.current)) flush();
    }, 15000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(iv);
    };
  }, [flush]);

  const schedule = (qid: string, value: unknown, comment: string, delay: number) => {
    // hned do zálohy v zařízení – přežije výpadek sítě i vybitý telefon
    draft.current.answers[qid] = { value: value === undefined ? null : value, comment, t: ++seq.current };
    storeDraft();
    clearTimeout(timers.current[qid]);
    setSaveState("saving");
    timers.current[qid] = setTimeout(() => {
      delete timers.current[qid];
      pushAnswer(qid);
    }, delay);
    setMissing((m) => m.filter((x) => x.question_id !== qid));
  };

  const setValue = (qid: string, v: unknown, delay = 0) => {
    setValues((s) => ({ ...s, [qid]: v }));
    schedule(qid, v, comments[qid] ?? "", delay);
  };
  const setComment = (qid: string, c: string) => {
    setComments((s) => ({ ...s, [qid]: c }));
    schedule(qid, values[qid] ?? null, c, 800);
  };
  const changeVisit = (v: string) => {
    setVisit(v);
    draft.current.visit = { value: v ? new Date(v).toISOString() : null, t: ++seq.current };
    storeDraft();
  };

  const changeSpent = (v: string) => {
    setSpent(v);
    const n = v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0)) return; // neplatné číslo neukládat
    draft.current.expense = { value: n === null ? null : Math.round(n * 100) / 100, t: ++seq.current };
    storeDraft();
  };

  // varování při zavření s neodeslanými změnami (v záloze ale zůstanou)
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (inFlight.current > 0 || draftSize(draft.current) > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const isAnswered = (q: Question) => {
    if (q.type === "file") return files.some((f) => f.question_id === q.id);
    const v = values[q.id];
    return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
  };
  const needsComment = (q: Question) =>
    q.comment_on_negative && questionFraction(q, values[q.id]) === 0 && !(comments[q.id] ?? "").trim();

  const required = questions.filter((q) => q.required);
  const done = required.filter(isAnswered).length;
  const missingIds = new Set(missing.map((m) => m.question_id));

  const submit = () => {
    if (!confirm("Odeslat kontrolu ke schválení? Potom už ji nebude možné upravit.")) return;
    startSubmit(async () => {
      // nejdřív dokončit rozepsané a neodeslané ukládání
      for (const [qid, t] of Object.entries(timers.current)) {
        clearTimeout(t);
        delete timers.current[qid];
      }
      await flush();
      if (draftSize(draft.current)) {
        setError("Některé odpovědi se zatím nepodařilo uložit, protože chybí připojení. Odešlete kontrolu, až budete online – odpovědi jsou bezpečně uložené v zařízení.");
        return;
      }
      let r;
      try {
        r = await submitInspection(inspectionId);
      } catch {
        setOnline(false);
        setError("Bez připojení nelze kontrolu odeslat. Zkuste to znovu, až budete online.");
        return;
      }
      if (r.ok) {
        clearDraft(inspectionId);
        router.push("/agent?odeslano=1");
        return;
      }
      setError(r.error ?? "Odeslání se nepovedlo.");
      setMissing(r.missing ?? []);
      const first = r.missing?.[0];
      const el = document.getElementById(first?.question_id ? `q-${first.question_id}` : "visit");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <div className="pb-28">
      {!online && (
        <div className="mb-4">
          <Notice tone="warn">
            <strong>Jste offline.</strong> Vyplňujte dál – odpovědi se ukládají do tohoto zařízení a automaticky se odešlou, jakmile
            bude připojení zpět. Fotky lze nahrát až s připojením.
          </Notice>
        </div>
      )}
      {restored > 0 && (
        <div className="mb-4">
          <Notice tone="info">
            Obnoveno {restored} {restored === 1 ? "neodeslaná odpověď" : restored < 5 ? "neodeslané odpovědi" : "neodeslaných odpovědí"} z
            tohoto zařízení{pendingCount === 0 ? " – vše je už uložené na serveru." : ", odesílám je…"}
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <Card className={cx("mb-4 flex flex-wrap gap-4 p-5", missingIds.has(null) && "ring-2 ring-bad")}>
        <label id="visit" className="block w-full max-w-xs">
          <span className="label">Datum a čas návštěvy {mode === "agent" && <span className="text-bad!">*</span>}</span>
          <input
            type="datetime-local"
            className="input"
            value={visit}
            onChange={(e) => changeVisit(e.target.value)}
            onBlur={() => {
              setMissing((m) => m.filter((x) => x.question_id !== null));
              flush();
            }}
          />
        </label>
        {mode === "agent" && (
          <label className="block w-full max-w-[12rem]">
            <span className="label">Útrata (Kč)</span>
            <input
              type="text"
              inputMode="decimal"
              className="input tabular"
              placeholder="např. 245"
              value={spent}
              onChange={(e) => changeSpent(e.target.value)}
              onBlur={() => flush()}
            />
          </label>
        )}
      </Card>

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {topics.map((t, i) => {
          const qs = questions.filter((q) => q.topic_id === t.id);
          const req = qs.filter((q) => q.required);
          const ok = req.filter(isAnswered).length;
          return (
            <a
              key={t.id}
              href={`#t-${t.id}`}
              className="shrink-0 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-brand-500"
            >
              {i + 1}. {t.title}{" "}
              <span className={cx("tabular", ok === req.length ? "text-good" : "text-ink-400")}>
                {ok}/{req.length}
              </span>
            </a>
          );
        })}
      </nav>

      <div className="space-y-4">
        {topics.map((t, ti) => {
          const qs = questions.filter((q) => q.topic_id === t.id).sort((a, b) => a.position - b.position);
          return (
            <Card key={t.id}>
              <h2 id={`t-${t.id}`} className="scroll-mt-24 border-b border-ink-100 px-5 py-3 font-semibold">
                <span className="tabular mr-2 text-ink-400">{ti + 1}</span>
                {t.title}
              </h2>
              <ol className="divide-y divide-ink-100">
                {qs.map((q, qi) => (
                  <QuestionField
                    key={q.id}
                    num={`${ti + 1}.${qi + 1}`}
                    q={q}
                    inspectionId={inspectionId}
                    value={values[q.id]}
                    comment={comments[q.id] ?? ""}
                    files={files.filter((f) => f.question_id === q.id)}
                    flagged={missingIds.has(q.id)}
                    commentRequired={needsComment(q)}
                    onValue={(v, delay) => setValue(q.id, v, delay)}
                    onComment={(c) => setComment(q.id, c)}
                    onFileAdded={(f) => {
                      setFiles((s) => [...s, f]);
                      setMissing((m) => m.filter((x) => x.question_id !== q.id));
                    }}
                    onFileRemoved={(id) => setFiles((s) => s.filter((f) => f.id !== id))}
                    onError={setError}
                  />
                ))}
              </ol>
            </Card>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              Vyplněno {done} z {required.length} povinných
            </p>
            <p className={cx("flex items-center gap-1.5 text-xs", !online || pendingCount ? "text-mid" : "text-ink-500")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", online ? (pendingCount ? "bg-mid" : "bg-good") : "bg-bad")} />
              {!online
                ? `Offline – ${pendingCount} ${pendingCount === 1 ? "změna čeká" : "změn čeká"} v zařízení na odeslání`
                : saveState === "saving"
                  ? "Ukládám…"
                  : saveState === "error"
                    ? "Chyba při ukládání"
                    : pendingCount
                      ? `Odesílám ${pendingCount} uložených změn…`
                      : saveState === "saved"
                        ? "Vše uloženo"
                        : "Odpovědi se ukládají automaticky"}
            </p>
          </div>
          {mode === "agent" ? (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Odesílám…" : "Odeslat ke schválení"}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => router.push(`/admin/kontroly/${inspectionId}`)}>
              Hotovo
            </Button>
          )}
        </div>
        <div className="h-1 bg-ink-100">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${required.length ? (done / required.length) * 100 : 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function QuestionField({
  num,
  q,
  inspectionId,
  value,
  comment,
  files,
  flagged,
  commentRequired,
  onValue,
  onComment,
  onFileAdded,
  onFileRemoved,
  onError,
}: {
  num: string;
  q: Question;
  inspectionId: string;
  value: unknown;
  comment: string;
  files: FileItem[];
  flagged: boolean;
  commentRequired: boolean;
  onValue: (v: unknown, delay?: number) => void;
  onComment: (c: string) => void;
  onFileAdded: (f: FileItem) => void;
  onFileRemoved: (id: string) => void;
  onError: (e: string) => void;
}) {
  const [showComment, setShowComment] = useState(Boolean(comment));
  const commentVisible = showComment || commentRequired || Boolean(comment);

  return (
    <li id={`q-${q.id}`} className={cx("scroll-mt-24 px-5 py-4", flagged && "bg-bad-bg/40")}>
      <div className="flex gap-3">
        <span className="tabular w-8 shrink-0 pt-0.5 text-xs text-ink-400">{num}</span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-ink-900">
              {q.text} {q.required && <span className="text-bad!">*</span>}
            </p>
            {q.help_text && <p className="mt-0.5 text-xs text-ink-500">{q.help_text}</p>}
            {flagged && <p className="mt-1 text-xs font-medium text-bad">Tuto otázku je potřeba vyplnit.</p>}
          </div>

          <AnswerInput q={q} value={value} onValue={onValue} />

          {(q.type === "file" || files.length > 0) && (
            <FileList files={files} inspectionId={inspectionId} onRemoved={onFileRemoved} onError={onError} />
          )}

          {commentVisible ? (
            <label className="block">
              <span className={cx("text-xs font-medium", commentRequired ? "text-bad" : "text-ink-600")}>
                Komentář {commentRequired && "(povinný při záporné odpovědi)"}
              </span>
              <textarea
                rows={2}
                className={cx("input mt-1", commentRequired && "border-bad")}
                value={comment}
                onChange={(e) => onComment(e.target.value)}
              />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3 text-xs">
            {!commentVisible && (
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setShowComment(true)}>
                + Přidat komentář
              </button>
            )}
            <Uploader
              inspectionId={inspectionId}
              questionId={q.id}
              label={q.type === "file" ? "Nahrát fotku / soubor" : "+ Přidat fotku"}
              prominent={q.type === "file"}
              onAdded={onFileAdded}
              onError={onError}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function Seg({ active, children, onClick, tone }: { active: boolean; children: React.ReactNode; onClick: () => void; tone?: "good" | "bad" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "min-w-16 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? tone === "good"
            ? "border-good bg-good text-white"
            : tone === "bad"
              ? "border-bad bg-bad text-white"
              : "border-brand-600 bg-brand-600 text-white"
          : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
      )}
    >
      {children}
    </button>
  );
}

function AnswerInput({ q, value, onValue }: { q: Question; value: unknown; onValue: (v: unknown, delay?: number) => void }) {
  const toggle = (v: string) => onValue(value === v ? null : v);
  switch (q.type) {
    case "yes_no":
    case "yes_no_na":
      return (
        <div className="flex flex-wrap gap-2">
          <Seg active={value === "yes"} tone="good" onClick={() => toggle("yes")}>
            Ano
          </Seg>
          <Seg active={value === "no"} tone="bad" onClick={() => toggle("no")}>
            Ne
          </Seg>
          {q.type === "yes_no_na" && (
            <Seg active={value === "na"} onClick={() => toggle("na")}>
              Nelze posoudit
            </Seg>
          )}
        </div>
      );
    case "scale": {
      const min = q.config.min ?? 1;
      const max = q.config.max ?? 5;
      const steps = Array.from({ length: Math.min(max - min, 20) + 1 }, (_, i) => min + i);
      return (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onValue(value === n ? null : n)}
                className={cx(
                  "tabular h-10 w-10 rounded-lg border text-sm font-medium",
                  value === n ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {(q.config.minLabel || q.config.maxLabel) && (
            <p className="mt-1 text-xs text-ink-500">
              {min} = {q.config.minLabel ?? "nejhorší"}, {max} = {q.config.maxLabel ?? "nejlepší"}
            </p>
          )}
        </div>
      );
    }
    case "single_choice":
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {q.options.map((o) => (
            <label
              key={o.id}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                value === o.id ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white",
              )}
            >
              <input type="radio" name={q.id} checked={value === o.id} onChange={() => onValue(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "multi_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {q.options.map((o) => (
            <label
              key={o.id}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                arr.includes(o.id) ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white",
              )}
            >
              <input
                type="checkbox"
                checked={arr.includes(o.id)}
                onChange={(e) => onValue(e.target.checked ? [...arr, o.id] : arr.filter((x) => x !== o.id))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "number":
    case "duration":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            className="input w-36"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onValue(e.target.value === "" ? null : Number(e.target.value), 700)}
          />
          <span className="text-sm text-ink-500">{q.type === "duration" ? "minut" : (q.config.unit ?? "")}</span>
        </div>
      );
    case "datetime":
      return (
        <input
          type="datetime-local"
          className="input max-w-xs"
          value={toLocalInput(typeof value === "string" ? value : null)}
          onChange={(e) => onValue(e.target.value ? new Date(e.target.value).toISOString() : null, 700)}
        />
      );
    case "short_text":
      return (
        <input className="input" value={typeof value === "string" ? value : ""} onChange={(e) => onValue(e.target.value, 800)} />
      );
    case "long_text":
      return (
        <textarea
          rows={4}
          className="input"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onValue(e.target.value, 800)}
        />
      );
    default:
      return null;
  }
}

/** Zmenší fotku v prohlížeči (max. 2000 px, JPEG), ať se rychle nahraje i přes mobilní data. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function Uploader({
  inspectionId,
  questionId,
  label,
  prominent,
  onAdded,
  onError,
}: {
  inspectionId: string;
  questionId: string;
  label: string;
  prominent?: boolean;
  onAdded: (f: FileItem) => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of Array.from(list)) {
        if (file.size > 20 * 1024 * 1024) {
          onError(`Soubor ${file.name} je větší než 20 MB.`);
          continue;
        }
        const blob = await compress(file);
        const isJpeg = blob !== file;
        const ext = isJpeg ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${inspectionId}/${crypto.randomUUID()}.${ext}`;
        const mime = isJpeg ? "image/jpeg" : file.type || "application/octet-stream";
        const { error: upErr } = await supabase.storage.from("attachments").upload(path, blob, { contentType: mime });
        if (upErr) throw upErr;
        const { data, error } = await supabase
          .from("attachments")
          .insert({
            inspection_id: inspectionId,
            question_id: questionId,
            storage_path: path,
            file_name: file.name,
            mime_type: mime,
            size_bytes: blob.size,
          })
          .select("id")
          .single();
        if (error) {
          await supabase.storage.from("attachments").remove([path]);
          throw error;
        }
        onAdded({
          id: data.id,
          question_id: questionId,
          storage_path: path,
          file_name: file.name,
          mime_type: mime,
          url: URL.createObjectURL(blob),
        });
      }
    } catch (e) {
      onError("Nahrání souboru se nepovedlo: " + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className={
          prominent
            ? "rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-500"
            : "text-brand-700 hover:underline"
        }
      >
        {busy ? "Nahrávám…" : label}
      </button>
    </>
  );
}

function FileList({
  files,
  inspectionId,
  onRemoved,
  onError,
}: {
  files: FileItem[];
  inspectionId: string;
  onRemoved: (id: string) => void;
  onError: (e: string) => void;
}) {
  if (files.length === 0) return null;
  const remove = async (f: FileItem) => {
    if (!confirm(`Odstranit ${f.file_name}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("attachments").delete().eq("id", f.id).eq("inspection_id", inspectionId);
    if (error) return onError("Soubor se nepodařilo odstranit.");
    await supabase.storage.from("attachments").remove([f.storage_path]);
    onRemoved(f.id);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <div key={f.id} className="group relative">
          {f.mime_type?.startsWith("image/") && f.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.url} alt={f.file_name} className="h-20 w-20 rounded-md border border-ink-200 object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md border border-ink-200 bg-ink-50 p-1 text-center text-[10px] break-all text-ink-600">
              {f.file_name}
            </div>
          )}
          <button
            type="button"
            onClick={() => remove(f)}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink-200 bg-white text-xs text-ink-600 shadow-sm hover:text-bad"
            aria-label="Odstranit"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
