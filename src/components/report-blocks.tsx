import {
  Card,
  CardHeader,
  EmptyState,
  ScoreBadge,
  ScoreBar,
  Table,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { scoreTone } from "@/lib/format";
import type { WeakPoint } from "@/lib/reports";

export type FilterValues = {
  firma?: string;
  provozovna?: string;
  dotaznik?: string;
  od?: string;
  do?: string;
};

export function ReportFilters({
  action,
  values,
  companies,
  branches,
  templates,
  extra,
}: {
  action: string;
  values: FilterValues;
  companies?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  templates: { id: string; name: string; count: number }[];
  extra?: React.ReactNode;
}) {
  return (
    <form action={action} className="mb-6 flex flex-wrap items-end gap-3">
      {companies && (
        <label>
          <span className="label">Firma</span>
          <select
            name="firma"
            defaultValue={values.firma ?? ""}
            className="input w-48"
          >
            <option value="">Všechny firmy</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {branches && (
        <label>
          <span className="label">Provozovna</span>
          <select
            name="provozovna"
            defaultValue={values.provozovna ?? ""}
            className="input w-48"
          >
            <option value="">Všechny</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {templates.length > 1 && (
        <label>
          <span className="label">Dotazník</span>
          <select
            name="dotaznik"
            defaultValue={values.dotaznik ?? ""}
            className="input w-52"
          >
            <option value="">Všechny</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className="label">Od</span>
        <input
          type="date"
          name="od"
          defaultValue={values.od ?? ""}
          className="input"
        />
      </label>
      <label>
        <span className="label">Do</span>
        <input
          type="date"
          name="do"
          defaultValue={values.do ?? ""}
          className="input"
        />
      </label>
      <button className="rounded-lg bg-ink-800 px-3.5 py-2 text-sm font-medium text-white">
        Použít
      </button>
      {extra && <div className="ml-auto flex gap-2">{extra}</div>}
    </form>
  );
}

export function TopicAverages({
  topics,
}: {
  topics: { title: string; score: number | null }[];
}) {
  return (
    <Card>
      <CardHeader title="Průměr po tématech" sub="Seřazeno od nejslabšího" />
      {topics.length === 0 ? (
        <EmptyState title="Žádná data" />
      ) : (
        <div className="space-y-3 p-5">
          {topics.map((t) => (
            <div
              key={t.title}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_56px] items-center gap-3 text-sm"
            >
              <span className="truncate">{t.title}</span>
              <ScoreBar score={t.score} />
              <span className="tabular text-right text-ink-700">
                {t.score === null
                  ? "—"
                  : `${t.score.toLocaleString("cs-CZ")} %`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function WeakPointsCard({ weak }: { weak: WeakPoint[] }) {
  return (
    <Card>
      <CardHeader
        title="Slabá místa"
        sub="Otázky s nejčastější zápornou odpovědí"
      />
      {weak.length === 0 ? (
        <EmptyState title="Žádné záporné odpovědi" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Otázka</Th>
              <Th className="text-right">Záporně</Th>
            </tr>
          </thead>
          <tbody>
            {weak.map((w) => (
              <tr key={w.topic + w.text}>
                <Td>
                  <p>{w.text}</p>
                  <p className="text-xs text-ink-500">{w.topic}</p>
                </Td>
                <Td className="tabular text-right whitespace-nowrap">
                  <span className="font-semibold text-bad">{w.share} %</span>
                  <span className="block text-xs text-ink-500">
                    {w.negative} z {w.total}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

type RankRow = {
  branchId: string;
  name: string;
  company?: string;
  count: number;
  avg: number | null;
  last: number | null;
  change: number | null;
  topics: Record<string, number | null>;
};

export function RankingTable({
  rows,
  topics,
  showCompany,
}: {
  rows: RankRow[];
  topics: string[];
  showCompany?: boolean;
}) {
  if (rows.length === 0)
    return <EmptyState title="Žádné schválené kontroly v tomto období" />;
  const cell = (s: number | null) =>
    ({
      good: "bg-good-bg text-good",
      mid: "bg-mid-bg text-mid",
      bad: "bg-bad-bg text-bad",
      none: "text-ink-400",
    })[scoreTone(s)];
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-8">#</Th>
          <Th>Provozovna</Th>
          <Th className="text-right">Kontrol</Th>
          <Th className="text-right">Průměr</Th>
          <Th className="text-right">Poslední</Th>
          {topics.map((t) => (
            <Th key={t} className="max-w-28 text-right normal-case">
              <span className="line-clamp-2">{t}</span>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.branchId}>
            <Td className="tabular text-ink-400">{i + 1}</Td>
            <Td>
              <p className="font-medium">{r.name}</p>
              {showCompany && (
                <p className="text-xs text-ink-500">{r.company}</p>
              )}
            </Td>
            <Td className="tabular text-right">{r.count}</Td>
            <Td className="text-right">
              <ScoreBadge score={r.avg} />
            </Td>
            <Td className="tabular text-right whitespace-nowrap">
              {r.last === null
                ? "—"
                : `${Number(r.last).toLocaleString("cs-CZ")} %`}
              {r.change !== null && r.change !== 0 && (
                <span
                  className={cx(
                    "ml-1 text-xs",
                    r.change > 0 ? "text-good" : "text-bad",
                  )}
                >
                  {r.change > 0 ? "▲" : "▼"}{" "}
                  {Math.abs(r.change).toLocaleString("cs-CZ")}
                </span>
              )}
            </Td>
            {topics.map((t) => (
              <Td key={t} className="text-right">
                <span
                  className={cx(
                    "tabular inline-block min-w-12 rounded px-1.5 py-0.5 text-xs font-medium",
                    cell(r.topics[t]),
                  )}
                >
                  {r.topics[t] === null
                    ? "—"
                    : `${r.topics[t]!.toLocaleString("cs-CZ")} %`}
                </span>
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
