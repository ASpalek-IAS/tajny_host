import { Card, ScoreBadge, ScoreBar, cx } from "@/components/ui";
import type { InspectionContent, AttachmentWithUrl } from "@/lib/inspection-data";
import { formatAnswer } from "@/lib/answer-format";
import { isScored, questionFraction, type Question } from "@/lib/types";

function answerTone(f: number | null) {
  if (f === null) return "bg-ink-100 text-ink-800";
  if (f >= 1) return "bg-good-bg text-good";
  if (f <= 0) return "bg-bad-bg text-bad";
  return "bg-mid-bg text-mid";
}

export function ScoreSummary({
  score,
  topics,
}: {
  score: number | null;
  topics: { title: string; score: number | null | undefined }[];
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs font-medium text-ink-500">Celkové skóre</p>
          <div className="mt-1">
            <ScoreBadge score={score} size="lg" />
          </div>
        </div>
        <div className="grid min-w-64 flex-1 gap-2.5">
          {topics.map((t) => (
            <div key={t.title} className="grid grid-cols-[minmax(0,1fr)_120px_56px] items-center gap-3 text-sm">
              <span className="truncate text-ink-700">{t.title}</span>
              <ScoreBar score={t.score} />
              <span className="tabular text-right text-ink-600">{t.score === null || t.score === undefined ? "—" : `${Number(t.score).toLocaleString("cs-CZ")} %`}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function InspectionResult({ content, showScores = true }: { content: InspectionContent; showScores?: boolean }) {
  const { topics, questions, answers, attachments } = content;
  const general = attachments.filter((a) => !a.question_id);
  return (
    <div className="space-y-4">
      {topics.map((t, ti) => {
        const qs = questions.filter((q) => q.topic_id === t.id).sort((a, b) => a.position - b.position);
        return (
          <Card key={t.id}>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <h3 className="font-semibold">
                <span className="tabular mr-2 text-ink-400">{ti + 1}</span>
                {t.title}
              </h3>
              {showScores && t.score !== undefined && t.score !== null && <ScoreBadge score={t.score} />}
            </div>
            <ol className="divide-y divide-ink-100">
              {qs.map((q, qi) => (
                <QuestionRow
                  key={q.id}
                  num={`${ti + 1}.${qi + 1}`}
                  q={q}
                  answer={answers[q.id]}
                  files={attachments.filter((a) => a.question_id === q.id)}
                  showScores={showScores}
                />
              ))}
            </ol>
          </Card>
        );
      })}
      {general.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Další přílohy</h3>
          <Files files={general} />
        </Card>
      )}
    </div>
  );
}

function QuestionRow({
  num,
  q,
  answer,
  files,
  showScores,
}: {
  num: string;
  q: Question;
  answer?: { value: unknown; comment: string | null; fraction: number | null };
  files: AttachmentWithUrl[];
  showScores: boolean;
}) {
  const f = answer?.fraction ?? questionFraction(q, answer?.value);
  const scored = isScored(q);
  const isText = q.type === "long_text" || q.type === "short_text";
  return (
    <li className="grid gap-2 px-5 py-3.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,16rem)]">
      <span className="tabular text-xs text-ink-400 sm:pt-0.5">{num}</span>
      <div className="min-w-0">
        <p className="text-sm text-ink-900">{q.text}</p>
        {answer?.comment && (
          <p className="mt-1.5 rounded-md bg-ink-50 px-2.5 py-1.5 text-sm text-ink-700">
            <span className="text-ink-500">Komentář: </span>
            {answer.comment}
          </p>
        )}
        {isText && answer?.value ? <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-700">{String(answer.value)}</p> : null}
        {files.length > 0 && (
          <div className="mt-2">
            <Files files={files} />
          </div>
        )}
      </div>
      <div className="sm:text-right">
        {q.type === "file" ? (
          <span className="text-xs text-ink-500">{files.length ? `${files.length} soubor(ů)` : "—"}</span>
        ) : isText ? null : (
          <span
            className={cx(
              "inline-block rounded-md px-2 py-0.5 text-sm font-medium",
              showScores && scored ? answerTone(f) : "bg-ink-100 text-ink-800",
            )}
          >
            {formatAnswer(q, answer?.value)}
          </span>
        )}
      </div>
    </li>
  );
}

function Files({ files }: { files: AttachmentWithUrl[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) =>
        f.mime_type?.startsWith("image/") && f.url ? (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.file_name} className="h-24 w-24 rounded-md border border-ink-200 object-cover" />
          </a>
        ) : (
          <a
            key={f.id}
            href={f.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-ink-200 px-2.5 py-1.5 text-xs text-brand-700 hover:bg-ink-50"
          >
            {f.file_name}
          </a>
        ),
      )}
    </div>
  );
}
