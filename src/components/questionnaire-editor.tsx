"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, cx, Notice } from "@/components/ui";
import { Dialog } from "@/components/client-ui";
import {
  addQuestion,
  addTopic,
  deleteQuestion,
  deleteTopic,
  moveQuestion,
  moveTopic,
  updateQuestion,
  updateTopic,
  type QuestionInput,
  type Scope,
} from "@/app/admin/actions/questionnaire";
import {
  isScored,
  QUESTION_TYPE_LABEL,
  type ChoiceOption,
  type Question,
  type QuestionType,
  type Topic,
} from "@/lib/types";
import type { ActionResult } from "@/lib/action-result";

export type LibraryQuestion = Question & {
  template_name: string;
  company_name: string;
  source?: "template" | "history";
  /** všechny šablony, ve kterých se stejné znění otázky vyskytuje */
  sources?: { template_name: string; company_name: string }[];
};

export function QuestionnaireEditor({
  scope,
  parentId,
  topics,
  questions,
  readOnly,
  usage = 0,
  library = {},
}: {
  scope: Scope;
  parentId: string;
  topics: Topic[];
  questions: Question[];
  readOnly?: boolean;
  /** počet existujících kontrol z této šablony */
  usage?: number;
  /** otázky z témat se stejným názvem v jiných šablonách, klíč = název tématu malými písmeny */
  library?: Record<string, LibraryQuestion[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const canSync = scope === "template" && usage > 0;

  const exec = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      setInfo(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        if (r.message) setInfo(r.message);
        after?.();
        router.refresh();
      }
    });

  const totalWeight = topics.reduce((s, t) => s + Number(t.weight), 0);

  return (
    <div className={cx("space-y-4", pending && "opacity-70")}>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
        <span>
          <strong className="text-ink-900">{topics.length}</strong> témat
        </span>
        <span>
          <strong className="text-ink-900">{questions.length}</strong> otázek
        </span>
        <span>
          <strong className="text-ink-900">{questions.filter((q) => isScored(q)).length}</strong> bodovaných
        </span>
      </div>

      {topics.length === 0 && (
        <Card className="px-6 py-10 text-center text-sm text-ink-500">
          Dotazník je zatím prázdný. Začněte přidáním prvního tématu.
        </Card>
      )}

      {topics.map((t, ti) => {
        const qs = questions.filter((q) => q.topic_id === t.id).sort((a, b) => a.position - b.position);
        const share = totalWeight > 0 ? Math.round((Number(t.weight) / totalWeight) * 100) : 0;
        return (
          <Card key={t.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
                  {ti + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{t.title}</h3>
                  <p className="text-xs text-ink-500">
                    {qs.length} {plural(qs.length, "otázka", "otázky", "otázek")} · váha {Number(t.weight)}
                    {totalWeight > 0 && ` (${share} % celkového skóre)`}
                  </p>
                </div>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <IconBtn label="Posunout nahoru" disabled={ti === 0} onClick={() => exec(() => moveTopic(scope, parentId, t.id, -1))}>
                    ↑
                  </IconBtn>
                  <IconBtn
                    label="Posunout dolů"
                    disabled={ti === topics.length - 1}
                    onClick={() => exec(() => moveTopic(scope, parentId, t.id, 1))}
                  >
                    ↓
                  </IconBtn>
                  <TopicDialog
                    title="Upravit téma"
                    initial={t}
                    usage={canSync ? usage : 0}
                    onSave={(title, weight, close, propagate) =>
                      exec(() => updateTopic(scope, parentId, t.id, title, weight, propagate), close)
                    }
                    trigger={(open) => (
                      <Button variant="ghost" size="sm" onClick={open}>
                        Upravit
                      </Button>
                    )}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-bad!"
                    onClick={() => {
                      if (confirm(`Smazat téma „${t.title}“ včetně ${qs.length} otázek?`))
                        exec(() => deleteTopic(scope, parentId, t.id));
                    }}
                  >
                    Smazat
                  </Button>
                </div>
              )}
            </div>

            <ol className="divide-y divide-ink-100">
              {qs.map((q, qi) => (
                <li key={q.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="tabular w-8 shrink-0 pt-0.5 text-xs text-ink-400">
                    {ti + 1}.{qi + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-900">{q.text}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{QUESTION_TYPE_LABEL[q.type]}</Badge>
                      {q.required ? <Badge>Povinná</Badge> : <Badge tone="neutral">Nepovinná</Badge>}
                      {isScored(q) ? <Badge tone="brand">Bodovaná · váha {Number(q.weight)}</Badge> : null}
                      {q.comment_on_negative && <Badge tone="mid">Komentář při záporné odpovědi</Badge>}
                    </div>
                    {q.help_text && <p className="mt-1 text-xs text-ink-500">Nápověda: {q.help_text}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center gap-1">
                      <IconBtn label="Nahoru" disabled={qi === 0} onClick={() => exec(() => moveQuestion(scope, parentId, t.id, q.id, -1))}>
                        ↑
                      </IconBtn>
                      <IconBtn
                        label="Dolů"
                        disabled={qi === qs.length - 1}
                        onClick={() => exec(() => moveQuestion(scope, parentId, t.id, q.id, 1))}
                      >
                        ↓
                      </IconBtn>
                      <QuestionDialog
                        title="Upravit otázku"
                        initial={q}
                        usage={canSync ? usage : 0}
                        onSave={(input, close, propagate) =>
                          exec(() => updateQuestion(scope, parentId, q.id, input, propagate), close)
                        }
                        trigger={(open) => (
                          <Button variant="ghost" size="sm" onClick={open}>
                            Upravit
                          </Button>
                        )}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-bad!"
                        onClick={() => {
                          if (confirm("Smazat otázku?")) exec(() => deleteQuestion(scope, parentId, q.id));
                        }}
                      >
                        Smazat
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {!readOnly && (
              <div className="border-t border-ink-100 px-5 py-3">
                <QuestionDialog
                  title={`Nová otázka – ${t.title}`}
                  library={(library[t.title.trim().toLowerCase()] ?? []).filter(
                    (lq) => !qs.some((x) => x.text.trim().toLowerCase() === lq.text.trim().toLowerCase()),
                  )}
                  topicTitle={t.title}
                  onSave={(input, close) => exec(() => addQuestion(scope, parentId, t.id, input), close)}
                  trigger={(open) => (
                    <Button variant="secondary" size="sm" onClick={open}>
                      + Přidat otázku
                    </Button>
                  )}
                />
              </div>
            )}
          </Card>
        );
      })}

      {!readOnly && (
        <TopicDialog
          title="Nové téma"
          onSave={(title, weight, close) => exec(() => addTopic(scope, parentId, title, weight), close)}
          trigger={(open) => (
            <Button variant="secondary" onClick={open}>
              + Přidat téma
            </Button>
          )}
        />
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SyncChoice({ usage, what }: { usage: number; what: string }) {
  if (!usage) return null;
  return (
    <fieldset className="space-y-2 rounded-lg border border-ink-200 p-4">
      <legend className="px-1 text-sm font-medium text-ink-700">Kde změnu použít</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="propagate" value="no" defaultChecked className="mt-0.5" />
        <span>Jen u nových kontrol</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="propagate" value="yes" className="mt-0.5" />
        <span>
          Také zpětně u všech existujících kontrol ({usage}) včetně dokončených
          <span className="hint block">
            Upraví se {what} ve všech kontrolách z této šablony. Odpovědi zůstanou, skóre schválených kontrol se přepočítá a
            klient uvidí novou verzi.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

function TopicDialog({
  title,
  initial,
  onSave,
  trigger,
  usage = 0,
}: {
  title: string;
  initial?: Topic;
  onSave: (title: string, weight: number, close: () => void, propagate: boolean) => void;
  trigger: (open: () => void) => React.ReactNode;
  usage?: number;
}) {
  return (
    <Dialog
      title={title}
      trigger={trigger}
      content={(close) => (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave(String(fd.get("title")), Number(fd.get("weight")), close, fd.get("propagate") === "yes");
          }}
        >
          <label className="block">
            <span className="label">Název tématu</span>
            <input name="title" defaultValue={initial?.title} required className="input" autoFocus placeholder="např. Obsluha" />
          </label>
          <label className="block">
            <span className="label">Váha v celkovém skóre</span>
            <input name="weight" type="number" min={0} step="0.1" defaultValue={initial?.weight ?? 1} className="input w-32" />
            <span className="hint block">
              Témata s vyšší váhou mají větší vliv na celkové skóre. Při stejné váze všech témat se počítá prostý průměr.
            </span>
          </label>
          {initial && <SyncChoice usage={usage} what="název a váha tématu" />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Zrušit
            </Button>
            <Button type="submit">Uložit</Button>
          </div>
        </form>
      )}
    />
  );
}

const TYPE_HELP: Record<QuestionType, string> = {
  yes_no: "Ano = plné body, ne = nula.",
  yes_no_na: "Odpověď „nelze posoudit“ se do skóre nezapočítá.",
  scale: "Body poměrně podle zvoleného stupně.",
  single_choice: "Každá možnost má své body. Plné skóre = možnost s nejvíce body.",
  multi_choice: "Sčítají se body zaškrtnutých možností.",
  number: "Volitelně limit: např. „počet lidí ve frontě nejvýše 3“ = plné body.",
  duration: "Agent zadává minuty. Volitelně limit: např. čekání do 3 minut = plné body.",
  datetime: "Nebodováno.",
  short_text: "Nebodováno.",
  long_text: "Nebodováno.",
  file: "Agent nahraje fotku nebo soubor. Nebodováno, může být povinné.",
};

function QuestionDialog({
  title,
  initial,
  onSave,
  trigger,
  usage = 0,
  library = [],
  topicTitle,
}: {
  title: string;
  initial?: Question;
  onSave: (q: QuestionInput, close: () => void, propagate: boolean) => void;
  trigger: (open: () => void) => React.ReactNode;
  usage?: number;
  library?: LibraryQuestion[];
  topicTitle?: string;
}) {
  return (
    <Dialog
      wide
      title={title}
      trigger={trigger}
      content={(close) =>
        initial ? (
          <QuestionForm initial={initial} usage={usage} onSave={(q, p) => onSave(q, close, p)} onCancel={close} />
        ) : (
          <NewQuestion library={library} topicTitle={topicTitle ?? ""} onSave={(q) => onSave(q, close, false)} onCancel={close} />
        )
      }
    />
  );
}

/** Nová otázka: vlastní, nebo převzatá z tématu se stejným názvem v jiné šabloně. */
function NewQuestion({
  library,
  topicTitle,
  onSave,
  onCancel,
}: {
  library: LibraryQuestion[];
  topicTitle: string;
  onSave: (q: QuestionInput) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"new" | "pick">(library.length ? "pick" : "new");
  const [picked, setPicked] = useState<LibraryQuestion | null>(null);
  const [filter, setFilter] = useState("");

  if (picked) {
    return (
      <div className="space-y-4">
        <Notice>
          Převzato {(picked.sources?.length ?? 1) > 1 ? "ze šablon" : "ze šablony"}{" "}
          <strong>{(picked.sources ?? [picked]).map((s) => s.template_name).join(", ")}</strong>
          {picked.company_name ? ` (${picked.company_name})` : ""}
          {picked.source === "history" ? " – dřívější znění použité v kontrolách" : ""}. Před uložením můžete otázku upravit.
        </Notice>
        <QuestionForm
          key={picked.id}
          initial={{ ...picked, id: "" }}
          onSave={(q) => onSave(q)}
          onCancel={() => setPicked(null)}
          cancelLabel="Zpět na výběr"
        />
      </div>
    );
  }

  const shown = library.filter((q) =>
    [q.text, ...(q.sources ?? [q]).flatMap((s) => [s.template_name, s.company_name])]
      .join(" ")
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("pick")}
          className={cx("flex-1 rounded-md px-3 py-1.5", mode === "pick" ? "bg-ink-100 font-medium" : "text-ink-500")}
        >
          Vybrat z existujících ({library.length})
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cx("flex-1 rounded-md px-3 py-1.5", mode === "new" ? "bg-ink-100 font-medium" : "text-ink-500")}
        >
          Napsat novou
        </button>
      </div>

      {mode === "new" ? (
        <QuestionForm onSave={onSave} onCancel={onCancel} />
      ) : library.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">
          V šablonách ani v dřívějších kontrolách není v tématu „{topicTitle}“ žádná otázka, která by tu ještě nebyla.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Otázky z témat „{topicTitle}“ ve všech šablonách včetně dřívějších znění použitých v kontrolách. Kliknutím otázku
            převezmete – před uložením ji můžete upravit.
          </p>
          <input className="input" placeholder="Hledat v otázkách…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="max-h-96 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-200">
            {shown.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => setPicked(q)} className="block w-full px-4 py-2.5 text-left hover:bg-ink-50">
                  <span className="block text-sm text-ink-900">{q.text}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {(q.sources ?? [q]).map((s) => (
                      <Badge key={s.template_name} tone="brand">
                        {s.template_name}
                      </Badge>
                    ))}
                    {q.source === "history" && <Badge tone="mid">dřívější znění</Badge>}
                    {[...new Set((q.sources ?? [q]).map((s) => s.company_name).filter(Boolean))].map((c) => (
                      <span key={c} className="text-xs text-ink-500">
                        {c}
                      </span>
                    ))}
                    <span className="text-xs text-ink-400">
                      · {QUESTION_TYPE_LABEL[q.type]}
                      {isScored(q) ? ` · váha ${Number(q.weight)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Nic nenalezeno</li>}
          </ul>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Zrušit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionForm({
  initial,
  onSave,
  onCancel,
  usage = 0,
  cancelLabel = "Zrušit",
}: {
  initial?: Question;
  onSave: (q: QuestionInput, propagate: boolean) => void;
  onCancel: () => void;
  usage?: number;
  cancelLabel?: string;
}) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? "yes_no");
  const [options, setOptions] = useState<ChoiceOption[]>(
    initial?.options?.length
      ? initial.options
      : [
          { id: "", label: "", points: 1 },
          { id: "", label: "", points: 0 },
        ],
  );
  const cfg = initial?.config ?? {};
  const scorable = !["datetime", "short_text", "long_text", "file"].includes(type);
  const negativeMakesSense = ["yes_no", "yes_no_na", "scale", "single_choice", "number", "duration"].includes(type);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const num = (k: string) => {
          const v = fd.get(k);
          return v === null || v === "" ? undefined : Number(v);
        };
        onSave({
          text: String(fd.get("text") ?? ""),
          help_text: String(fd.get("help_text") ?? ""),
          type,
          required: fd.get("required") === "on",
          weight: scorable ? Number(fd.get("weight") ?? 1) : 0,
          comment_on_negative: negativeMakesSense && fd.get("comment_on_negative") === "on",
          options,
          config: {
            min: num("min"),
            max: num("max"),
            minLabel: String(fd.get("minLabel") ?? "") || undefined,
            maxLabel: String(fd.get("maxLabel") ?? "") || undefined,
            threshold: num("threshold") ?? null,
            mode: fd.get("mode") === "gte" ? "gte" : "lte",
            unit: String(fd.get("unit") ?? "") || undefined,
          },
        }, fd.get("propagate") === "yes");
      }}
    >
      <label className="block">
        <span className="label">Otázka</span>
        <textarea name="text" required rows={2} defaultValue={initial?.text} className="input" autoFocus />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Typ odpovědi</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            {Object.entries(QUESTION_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <span className="hint block">{TYPE_HELP[type]}</span>
        </label>
        {scorable && (
          <label className="block">
            <span className="label">Váha otázky</span>
            <input name="weight" type="number" min={0} step="0.1" defaultValue={initial?.weight ?? 1} className="input w-32" />
            <span className="hint block">0 = otázka se nezapočítá do skóre</span>
          </label>
        )}
      </div>

      {type === "scale" && (
        <div className="grid gap-4 rounded-lg bg-ink-50 p-4 sm:grid-cols-4">
          <label>
            <span className="label">Od</span>
            <input name="min" type="number" defaultValue={cfg.min ?? 1} className="input" />
          </label>
          <label>
            <span className="label">Do</span>
            <input name="max" type="number" defaultValue={cfg.max ?? 5} className="input" />
          </label>
          <label>
            <span className="label">Popis minima</span>
            <input name="minLabel" defaultValue={cfg.minLabel ?? ""} placeholder="velmi špatné" className="input" />
          </label>
          <label>
            <span className="label">Popis maxima</span>
            <input name="maxLabel" defaultValue={cfg.maxLabel ?? ""} placeholder="výborné" className="input" />
          </label>
        </div>
      )}

      {(type === "number" || type === "duration") && (
        <div className="grid gap-4 rounded-lg bg-ink-50 p-4 sm:grid-cols-3">
          <label>
            <span className="label">Plné body, když je hodnota</span>
            <select name="mode" defaultValue={cfg.mode ?? "lte"} className="input">
              <option value="lte">nejvýše</option>
              <option value="gte">alespoň</option>
            </select>
          </label>
          <label>
            <span className="label">Limit{type === "duration" ? " (minuty)" : ""}</span>
            <input name="threshold" type="number" step="any" defaultValue={cfg.threshold ?? ""} placeholder="bez bodování" className="input" />
          </label>
          {type === "number" && (
            <label>
              <span className="label">Jednotka</span>
              <input name="unit" defaultValue={cfg.unit ?? ""} placeholder="např. osob" className="input" />
            </label>
          )}
        </div>
      )}

      {(type === "single_choice" || type === "multi_choice") && (
        <div className="rounded-lg bg-ink-50 p-4">
          <div className="mb-2 grid grid-cols-[1fr_90px_32px] gap-2 text-xs font-medium text-ink-500">
            <span>Možnost</span>
            <span>Body</span>
            <span />
          </div>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_32px] gap-2">
                <input
                  className="input"
                  value={o.label}
                  placeholder={`Možnost ${i + 1}`}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={o.points}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}
                />
                <button
                  type="button"
                  className="rounded-md text-ink-400 hover:bg-ink-100 hover:text-bad"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  aria-label="Odebrat možnost"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setOptions([...options, { id: "", label: "", points: 0 }])}>
            + Přidat možnost
          </Button>
        </div>
      )}

      <label className="block">
        <span className="label">Nápověda pro agenta</span>
        <input name="help_text" defaultValue={initial?.help_text ?? ""} className="input" placeholder="Na co se zaměřit, jak odpovědět…" />
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" defaultChecked={initial?.required ?? true} />
          Povinná otázka
        </label>
        {negativeMakesSense && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="comment_on_negative" defaultChecked={initial?.comment_on_negative ?? false} />
            Při záporné odpovědi (nula bodů) vyžadovat komentář
          </label>
        )}
      </div>

      {initial?.id && <SyncChoice usage={usage} what="znění, váha a nastavení otázky" />}

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit">Uložit otázku</Button>
      </div>
    </form>
  );
}
