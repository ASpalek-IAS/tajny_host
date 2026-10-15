"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "@/components/ui";

// Kategoriální paleta (ověřené pořadí). Barva patří sérii, ne pořadí.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const GRID = "#e2e0db";
const AXIS = "#77736b";
const MAX_TOPICS = 3;

function fmtMonthShort(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" });
}

type Point = Record<string, number | string | null>;

export function TrendChart({ data, topics }: { data: Point[]; topics: string[] }) {
  // barva se tématu přidělí při výběru a zůstane mu, dokud ho uživatel nevypne
  const [picked, setPicked] = useState<{ title: string; color: string }[]>([]);
  const selected = picked.map((p) => p.title);
  const series = ["Celkem", ...selected];
  const color = (n: string) => (n === "Celkem" ? SERIES[0] : (picked.find((p) => p.title === n)?.color ?? SERIES[1]));
  const toggle = (t: string) => {
    if (selected.includes(t)) setPicked(picked.filter((p) => p.title !== t));
    else {
      const free = SERIES.slice(1).find((c) => !picked.some((p) => p.color === c));
      if (free) setPicked([...picked, { title: t, color: free }]);
    }
  };

  if (data.length === 0) return <p className="px-5 py-10 text-center text-sm text-ink-500">Zatím žádné schválené kontroly.</p>;

  return (
    <div className="px-2 pt-2 pb-4">
      {topics.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 text-xs">
          <span className="mr-1 text-ink-500">Porovnat s tématem:</span>
          {topics.map((t) => {
            const on = selected.includes(t);
            const disabled = !on && selected.length >= MAX_TOPICS;
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => toggle(t)}
                className={cx(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  on ? "border-ink-300 bg-ink-50 text-ink-900" : "border-ink-200 text-ink-600 hover:border-ink-300",
                  disabled && "opacity-40",
                )}
              >
                {on && <span className="h-2 w-2 rounded-full" style={{ background: color(t) }} />}
                {t}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-4 px-3 pb-2 text-xs text-ink-700">
        {series.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: color(s), height: s === "Celkem" ? 3 : 2 }} />
            {s}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonthShort}
              tick={{ fill: AXIS, fontSize: 12 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
            />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} width={52} unit=" %" />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }}
              labelFormatter={(l) => fmtMonthShort(String(l))}
              formatter={(v, name) => [v === null || v === undefined ? "—" : `${Number(v).toLocaleString("cs-CZ")} %`, name]}
            />
            {series.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={color(s)}
                strokeWidth={s === "Celkem" ? 3 : 2}
                dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BranchBars({ data }: { data: { name: string; avg: number | null; count: number }[] }) {
  const rows = data.filter((d) => d.avg !== null);
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-ink-500">Žádná data.</p>;
  return (
    <div className="px-3 py-4" style={{ height: Math.max(120, rows.length * 34 + 40) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }} barCategoryGap={8}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} unit=" %" />
          <YAxis type="category" dataKey="name" width={160} tick={{ fill: "#2b2926", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "#efeeeb" }}
            contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }}
            formatter={(v, _n, item) => [`${Number(v).toLocaleString("cs-CZ")} % (${(item.payload as { count: number }).count} kontrol)`, "Průměr"]}
          />
          <Bar dataKey="avg" fill={SERIES[0]} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="avg" position="right" formatter={(v) => `${Number(v).toLocaleString("cs-CZ")} %`} style={{ fill: "#44413c", fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
