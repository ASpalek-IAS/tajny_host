import "server-only";
import path from "node:path";
import {
  Circle,
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { InspectionContent, AttachmentWithUrl } from "@/lib/inspection-data";
import { formatAnswer } from "@/lib/answer-format";
import { isScored, questionFraction, type Question, type Topic } from "@/lib/types";
import { fmtDate, fmtScore, scoreTone } from "@/lib/format";

// ---------------------------------------------------------------------------
// Písma
// ---------------------------------------------------------------------------
const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter_400Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Inter_600SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Inter_700Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

// ---------------------------------------------------------------------------
// Barvy
// ---------------------------------------------------------------------------
const C = {
  navy: "#152b64",
  navy2: "#21407f",
  navySoft: "#e8eef8",
  ink: "#1b1a18",
  ink2: "#44413c",
  muted: "#77736b",
  faint: "#a19d94",
  line: "#e2e0db",
  soft: "#f6f6f3",
  white: "#ffffff",
  good: "#1d7f4e",
  goodBg: "#e6f4ec",
  mid: "#b26a06",
  midBg: "#fdf1dc",
  bad: "#c0281c",
  badBg: "#fdecea",
};

function tone(score: number | null | undefined) {
  const t = scoreTone(score);
  if (t === "good") return { fg: C.good, bg: C.goodBg, label: "Výborné plnění" };
  if (t === "mid") return { fg: C.mid, bg: C.midBg, label: "Průměrné plnění" };
  if (t === "bad") return { fg: C.bad, bg: C.badBg, label: "Neuspokojivé plnění" };
  return { fg: C.muted, bg: C.soft, label: "Bez hodnocení" };
}

const pct = (s: number | null | undefined) => fmtScore(s);

// ---------------------------------------------------------------------------
// Styly
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: C.ink, paddingTop: 70, paddingBottom: 56, paddingHorizontal: 40, backgroundColor: C.white },
  cover: { fontFamily: "Inter", fontSize: 9.5, color: C.ink, padding: 0, backgroundColor: C.white },

  // záhlaví a zápatí běžných stran
  head: { position: "absolute", top: 0, left: 0, right: 0, height: 44, backgroundColor: C.navy, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 40 },
  headApp: { color: C.white, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 },
  headBranch: { color: "#c9d2e3", fontSize: 8.5 },
  foot: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 8, fontSize: 7.5, color: C.muted },

  // titulní strana
  hero: { backgroundColor: C.navy, paddingHorizontal: 40, paddingTop: 40, paddingBottom: 36 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { color: "#9fb0cf", fontSize: 8.5, fontWeight: 600, letterSpacing: 1.4 },
  heroTitle: { color: C.white, fontSize: 26, fontWeight: 700, marginTop: 14, lineHeight: 1.15 },
  heroSub: { color: "#c9d2e3", fontSize: 11, marginTop: 6 },
  logoBox: { backgroundColor: C.white, borderRadius: 6, padding: 8, maxWidth: 140 },
  logo: { maxHeight: 44, maxWidth: 124, objectFit: "contain" },
  metaRow: { flexDirection: "row", marginTop: 22, gap: 10 },
  metaCell: { flex: 1, backgroundColor: C.navy2, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10 },
  metaLabel: { color: "#9fb0cf", fontSize: 7.5, marginBottom: 2 },
  metaValue: { color: C.white, fontSize: 9.5, fontWeight: 600 },

  // obecné
  h2: { fontSize: 14, fontWeight: 700, color: C.navy },
  card: { borderWidth: 0.8, borderColor: C.line, borderRadius: 8, padding: 14 },
  sectionLabel: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 8 },
});

// ---------------------------------------------------------------------------
// Grafické prvky
// ---------------------------------------------------------------------------
function ScoreRing({ score, size = 120, stroke = 11, light = false }: { score: number | null; size?: number; stroke?: number; light?: boolean }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const v = Math.max(0, Math.min(100, score ?? 0));
  const t = tone(score);
  const a = (v / 100) * 2 * Math.PI - Math.PI / 2;
  const x = c + r * Math.cos(a);
  const y = c + r * Math.sin(a);
  const large = v > 50 ? 1 : 0;
  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={r} stroke={light ? "#3a4b6e" : C.soft} strokeWidth={stroke} fill="none" />
        {v >= 99.95 ? (
          <Circle cx={c} cy={c} r={r} stroke={t.fg} strokeWidth={stroke} fill="none" />
        ) : v > 0 ? (
          <Path d={`M ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`} stroke={t.fg} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        ) : null}
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.2, fontWeight: 700, color: light ? C.white : C.ink }}>{pct(score)}</Text>
      </View>
    </View>
  );
}

function Bar({ score, height = 6 }: { score: number | null | undefined; height?: number }) {
  const t = tone(score);
  return (
    <View style={{ height, width: "100%", backgroundColor: "#ecebe6", borderRadius: height / 2 }}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: t.fg, width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
    </View>
  );
}

function Mark({ kind }: { kind: "yes" | "no" | "partial" | "na" }) {
  const size = 16;
  if (kind === "yes")
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Circle cx={8} cy={8} r={8} fill={C.good} />
        <Path d="M4.6 8.3 L7 10.6 L11.4 5.6" stroke={C.white} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  if (kind === "no")
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Circle cx={8} cy={8} r={8} fill={C.bad} />
        <Path d="M5.3 5.3 L10.7 10.7 M10.7 5.3 L5.3 10.7" stroke={C.white} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  if (kind === "partial")
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Circle cx={8} cy={8} r={7.2} fill="none" stroke={C.mid} strokeWidth={1.6} />
        <Path d="M8 0.8 A 7.2 7.2 0 0 1 8 15.2 Z" fill={C.mid} />
      </Svg>
    );
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={8} fill={C.soft} />
      <Path d="M5 8 L11 8" stroke={C.faint} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PageChrome({ appName, branchName, companyName, draft }: { appName: string; branchName: string; companyName: string; draft?: boolean }) {
  return (
    <>
      <View style={s.head} fixed>
        <Text style={s.headApp}>
          {appName.toUpperCase()}
          {draft ? "  ·  NÁHLED" : ""}
        </Text>
        <Text style={s.headBranch}>
          {companyName} · {branchName}
        </Text>
      </View>
      <View style={s.foot} fixed>
        <Text>Výsledek kontroly · {branchName}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export type HistoryPoint = { date: string; score: number | null; current: boolean };

export type PdfData = {
  appName: string;
  companyName: string;
  logo: Buffer | null;
  branchName: string;
  branchAddress: string | null;
  title: string;
  visitAt: string | null;
  approvedAt: string | null;
  score: number | null;
  approved: boolean;
  content: InspectionContent;
  images: Record<string, Buffer>;
  history: HistoryPoint[];
};

type Row = {
  q: Question;
  num: string;
  answer: { value: unknown; comment: string | null } | undefined;
  fraction: number | null;
  files: AttachmentWithUrl[];
};

type TopicBlock = {
  topic: Topic;
  index: number;
  scored: Row[];
  info: Row[];
  texts: Row[];
  achieved: number;
  max: number;
};

function hasValue(v: unknown) {
  return !(v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0));
}

function buildBlocks(content: InspectionContent): TopicBlock[] {
  const { topics, questions, answers, attachments } = content;
  let n = 0;
  return topics.map((topic) => {
    const qs = questions.filter((q) => q.topic_id === topic.id).sort((a, b) => a.position - b.position);
    const counts = Number(topic.weight) > 0 && qs.some((q) => isScored(q));
    let qn = 0;
    const rows: Row[] = qs.map((q) => {
      const a = answers[q.id];
      return {
        q,
        num: isScored(q) ? `${n + 1}.${++qn}` : "",
        answer: a,
        fraction: a?.fraction ?? questionFraction(q, a?.value),
        files: attachments.filter((f) => f.question_id === q.id),
      };
    });
    if (counts) n++;
    const scored = rows.filter((r) => isScored(r.q));
    const texts = rows.filter((r) => !isScored(r.q) && r.q.type === "long_text" && hasValue(r.answer?.value));
    const info = rows.filter(
      (r) => !isScored(r.q) && r.q.type !== "long_text" && r.q.type !== "file" && hasValue(r.answer?.value),
    );
    let achieved = 0;
    let max = 0;
    for (const r of scored) {
      if (r.fraction === null) continue;
      achieved += Number(r.q.weight) * r.fraction;
      max += Number(r.q.weight);
    }
    return { topic, index: counts ? n : 0, scored, info, texts, achieved, max };
  });
}

const isScoredTopic = (b: TopicBlock) => b.scored.length > 0 && Number(b.topic.weight) > 0;

function fmtPoints(x: number) {
  return Number.isInteger(x) ? String(x) : x.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
}

function fmtVisit(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

// ---------------------------------------------------------------------------
// Strany
// ---------------------------------------------------------------------------
function Cover({ d, blocks }: { d: PdfData; blocks: TopicBlock[] }) {
  const scoredBlocks = blocks.filter(isScoredTopic);
  const t = tone(d.score);
  const strengths = [...scoredBlocks].sort((a, b) => (b.topic.score ?? 0) - (a.topic.score ?? 0));
  return (
    <Page size="A4" style={s.cover}>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={s.eyebrow}>{d.appName.toUpperCase()} · VÝSLEDEK KONTROLY</Text>
            {!d.approved && (
              <View style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: C.midBg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ color: C.mid, fontSize: 8, fontWeight: 700, letterSpacing: 0.6 }}>NÁHLED – ČEKÁ NA SCHVÁLENÍ</Text>
              </View>
            )}
            <Text style={s.heroTitle}>{d.branchName}</Text>
            <Text style={s.heroSub}>{d.companyName}</Text>
          </View>
          {d.logo && (
            <View style={s.logoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={d.logo} style={s.logo} />
            </View>
          )}
        </View>
        <View style={s.metaRow}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Datum a čas návštěvy</Text>
            <Text style={s.metaValue}>{fmtVisit(d.visitAt)}</Text>
          </View>
          <View style={[s.metaCell, { flex: 1.4 }]}>
            <Text style={s.metaLabel}>Adresa</Text>
            <Text style={s.metaValue}>{d.branchAddress || "—"}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Dotazník</Text>
            <Text style={s.metaValue}>{d.title}</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 40, paddingTop: 28 }}>
          <View style={{ flexDirection: "row", gap: 24, alignItems: "center" }}>
            <View style={{ alignItems: "center", width: 150 }}>
              <ScoreRing score={d.score} size={140} stroke={13} />
              <Text style={{ marginTop: 10, fontSize: 8, color: C.muted, letterSpacing: 1, fontWeight: 600 }}>DOSAŽENÉ SKÓRE</Text>
              <View style={{ marginTop: 6, backgroundColor: t.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: t.fg, fontSize: 8.5, fontWeight: 700 }}>{t.label}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              {scoredBlocks.map((b) => (
                <View key={b.topic.id} style={{ marginBottom: 13 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink2, flex: 1, paddingRight: 8 }}>{b.topic.title}</Text>
                    <Text style={{ fontSize: 9.5, fontWeight: 700, color: tone(b.topic.score).fg }}>{pct(b.topic.score)}</Text>
                  </View>
                  <Bar score={b.topic.score} height={7} />
                </View>
              ))}
            </View>
          </View>

        {strengths.length > 1 && (
          <View style={{ flexDirection: "row", gap: 12, marginTop: 22 }}>
            <View style={[s.card, { flex: 1, backgroundColor: C.goodBg, borderColor: C.goodBg }]}>
              <Text style={[s.sectionLabel, { color: C.good }]}>NEJSILNĚJŠÍ OBLAST</Text>
              <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{strengths[0].topic.title}</Text>
              <Text style={{ color: C.good, fontWeight: 700, marginTop: 3 }}>{pct(strengths[0].topic.score)}</Text>
            </View>
            <View style={[s.card, { flex: 1, backgroundColor: C.badBg, borderColor: C.badBg }]}>
              <Text style={[s.sectionLabel, { color: C.bad }]}>PROSTOR KE ZLEPŠENÍ</Text>
              <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{strengths.at(-1)!.topic.title}</Text>
              <Text style={{ color: C.bad, fontWeight: 700, marginTop: 3 }}>{pct(strengths.at(-1)!.topic.score)}</Text>
            </View>
          </View>
        )}

        {d.history.length > 1 && <History points={d.history} />}

        {<ScaleLegend />}

        <View style={{ flexDirection: "row", gap: 16, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Text style={{ fontSize: 7.5, color: C.muted, fontWeight: 600 }}>ZNAČKY:</Text>
          <Legend kind="yes" label="splněno" />
          <Legend kind="no" label="nesplněno" />
          <Legend kind="partial" label="částečně splněno" />
          <Legend kind="na" label="netýká se (nezapočítává se)" />
        </View>
      </View>

      <View style={[s.foot, { left: 40, right: 40 }]}>
        <Text>{d.appName}</Text>
        <Text>{d.approved && d.approvedAt ? `Schváleno ${fmtDate(d.approvedAt)}` : "Náhled – kontrola zatím není schválená"}</Text>
      </View>
    </Page>
  );
}

function History({ points }: { points: HistoryPoint[] }) {
  const H = 90;
  return (
    <View style={[s.card, { marginTop: 18 }]} wrap={false}>
      <Text style={s.sectionLabel}>VÝVOJ HODNOCENÍ PROVOZOVNY</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: H + 30, gap: 10, paddingHorizontal: 4 }}>
        {points.map((p, i) => {
          const t = tone(p.score);
          const h = Math.max(2, ((p.score ?? 0) / 100) * H);
          return (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 8, fontWeight: 700, color: p.current ? t.fg : C.muted, marginBottom: 3 }}>{pct(p.score)}</Text>
              <View style={{ width: "70%", maxWidth: 34, height: h, backgroundColor: p.current ? t.fg : "#c9d2e3", borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
              <Text style={{ fontSize: 7.5, color: p.current ? C.ink : C.muted, marginTop: 4, fontWeight: p.current ? 700 : 400 }}>
                {fmtDate(p.date)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function InfoGrid({ rows }: { rows: Row[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {rows.map((r) => (
        <View
          key={r.q.id}
          style={{
            width: r.q.type === "short_text" && String(r.answer?.value ?? "").length > 40 ? "100%" : "32%",
            flexGrow: 1,
            backgroundColor: C.soft,
            borderRadius: 6,
            paddingVertical: 8,
            paddingHorizontal: 10,
          }}
          wrap={false}
        >
          <Text style={{ fontSize: 7.5, color: C.muted, marginBottom: 2 }}>{r.q.text}</Text>
          <Text style={{ fontSize: 10, fontWeight: 600 }}>{formatAnswer(r.q, r.answer?.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function TextBlock({ title, text, accent = C.navy2, bg = C.soft }: { title: string; text: string; accent?: string; bg?: string }) {
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <View wrap={text.length > 2600} style={{ backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: accent, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12, marginTop: 14 }}>
      <Text style={{ fontSize: 8, fontWeight: 700, color: accent, letterSpacing: 0.8, marginBottom: 6 }}>
        {title.toUpperCase()}
      </Text>
      {paras.map((p, i) => (
        <Text key={i} style={{ fontSize: 9.2, lineHeight: 1.5, color: C.ink2, marginBottom: i < paras.length - 1 ? 6 : 0 }}>
          {p.trim()}
        </Text>
      ))}
    </View>
  );
}

function Photos({ files, images, size = 110 }: { files: AttachmentWithUrl[]; images: Record<string, Buffer>; size?: number }) {
  const list = files.filter((f) => images[f.id]);
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {list.map((f) => (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image key={f.id} src={images[f.id]} style={{ width: size, height: size * 0.75, objectFit: "cover", borderRadius: 4 }} />
      ))}
    </View>
  );
}

function ScoredRow({ r, images }: { r: Row; images: Record<string, Buffer> }) {
  const f = r.fraction;
  const kind = f === null ? "na" : f >= 1 ? "yes" : f <= 0 ? "no" : "partial";
  const na = kind === "na";
  const failed = kind === "no";
  const binary = r.q.type === "yes_no" || r.q.type === "yes_no_na";
  return (
    <View style={{ paddingVertical: 6.5, borderBottomWidth: 0.6, borderBottomColor: C.line }} wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ width: 34, fontSize: 8, color: failed ? C.bad : C.faint, fontWeight: failed ? 700 : 400 }}>{r.num}</Text>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 9.2, color: na ? C.faint : C.ink }}>{r.q.text}</Text>
          {!binary && hasValue(r.answer?.value) && (
            <Text style={{ fontSize: 8.2, color: C.muted, marginTop: 1.5 }}>Odpověď: {formatAnswer(r.q, r.answer?.value)}</Text>
          )}
        </View>
        <View
          style={{
            width: 26,
            height: 17,
            borderRadius: 3,
            backgroundColor: na ? C.soft : C.navy,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
          }}
        >
          <Text style={{ fontSize: 8, fontWeight: 700, color: na ? C.faint : C.white }}>{na ? "0" : fmtPoints(Number(r.q.weight))}</Text>
        </View>
        <Mark kind={kind} />
      </View>
      {r.answer?.comment && (
        <Text style={{ marginLeft: 34, marginTop: 3, fontSize: 8.4, color: C.ink2, fontStyle: "normal" }}>Komentář: {r.answer.comment}</Text>
      )}
      {r.files.length > 0 && (
        <View style={{ marginLeft: 34 }}>
          <Photos files={r.files} images={images} size={90} />
        </View>
      )}
    </View>
  );
}

function TopicPage({ b, d, first, spaced }: { b: TopicBlock; d: PdfData; first: boolean; spaced?: boolean }) {
  const score = b.topic.score;
  return (
    <View break={!first} style={spaced ? { marginTop: 26 } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }} wrap={false}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.navySoft, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{b.index}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>{b.topic.title}</Text>
          {b.max > 0 && (
            <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>
              Dosaženo {fmtPoints(b.achieved)} z {fmtPoints(b.max)} bodů
            </Text>
          )}
        </View>
        <ScoreRing score={score ?? null} size={54} stroke={6} />
      </View>

      {(
        <View style={{ marginBottom: 12 }}>
          <Bar score={score} height={5} />
        </View>
      )}

      {b.info.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <InfoGrid rows={b.info} />
        </View>
      )}

      <View>
        {b.scored.map((r) => (
          <ScoredRow key={r.q.id} r={r} images={d.images} />
        ))}
      </View>

      {b.texts.map((r) => (
        <TextBlock key={r.q.id} title={r.q.text} text={String(r.answer?.value ?? "")} />
      ))}
    </View>
  );
}

function Legend({ kind, label }: { kind: "yes" | "no" | "partial" | "na"; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ transform: "scale(0.75)" }}>
        <Mark kind={kind} />
      </View>
      <Text style={{ fontSize: 7.5, color: C.muted }}>{label}</Text>
    </View>
  );
}

/** Téma bez bodování (informace o návštěvě, pozitiva/negativa, poznámky). */
function InfoTopic({ b, first }: { b: TopicBlock; first: boolean }) {
  const pos = b.texts.find((r) => /pozitiv/i.test(r.q.text));
  const neg = b.texts.find((r) => /negativ/i.test(r.q.text));
  const rest = b.texts.filter((r) => r !== pos && r !== neg);
  if (!b.info.length && !b.texts.length) return null;
  return (
    <View style={{ marginTop: first ? 0 : 22 }}>
      <Text style={[s.h2, { marginBottom: 10 }]}>{b.topic.title}</Text>
      {b.info.length > 0 && <InfoGrid rows={b.info} />}
      {(pos || neg) && (
        <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
          {pos && <ListCard title={pos.q.text} text={String(pos.answer?.value)} fg={C.good} bg={C.goodBg} sign="+" />}
          {neg && <ListCard title={neg.q.text} text={String(neg.answer?.value)} fg={C.bad} bg={C.badBg} sign="–" />}
        </View>
      )}
      {rest.map((r) => (
        <TextBlock key={r.q.id} title={r.q.text} text={String(r.answer?.value ?? "")} />
      ))}
    </View>
  );
}

function ListCard({ title, text, fg, bg, sign }: { title: string; text: string; fg: string; bg: string; sign: string }) {
  const items = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-–•*]\s*/, "").trim())
    .filter(Boolean);
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 8, padding: 12 }}>
      <Text style={{ fontSize: 8, fontWeight: 700, color: fg, letterSpacing: 0.8, marginBottom: 8 }}>{title.toUpperCase()}</Text>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 4 }}>
          <Text style={{ width: 12, color: fg, fontWeight: 700 }}>{sign}</Text>
          <Text style={{ flex: 1, fontSize: 9, color: C.ink2, lineHeight: 1.4 }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function ScaleLegend() {
  const rows = [
    { range: "85–100 %", label: "výborné plnění", fg: C.good, bg: C.goodBg },
    { range: "65–84 %", label: "průměrné plnění", fg: C.mid, bg: C.midBg },
    { range: "0–64 %", label: "neuspokojivé plnění", fg: C.bad, bg: C.badBg },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 16, marginTop: 18, alignItems: "center", flexWrap: "wrap" }} wrap={false}>
      <Text style={{ fontSize: 7.5, color: C.muted, fontWeight: 600 }}>HODNOCENÍ SKÓRE:</Text>
      {rows.map((r) => (
        <View key={r.range} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ backgroundColor: r.bg, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 }}>
            <Text style={{ color: r.fg, fontWeight: 700, fontSize: 7.5 }}>{r.range}</Text>
          </View>
          <Text style={{ fontSize: 7.5, color: C.ink2 }}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Report({ d: input }: { d: PdfData }) {
  const blocks = buildBlocks(input.content);
  let d = input;
  if (!input.approved) {
    // Neschválená kontrola: skóre v databázi ještě není, dopočítáme ho stejně jako při schválení
    const round1 = (x: number) => Math.round(x * 10) / 10;
    for (const b of blocks) b.topic.score = b.max > 0 ? round1((b.achieved / b.max) * 100) : null;
    const counted = blocks.filter((b) => isScoredTopic(b) && b.topic.score !== null);
    const w = counted.reduce((sum, b) => sum + Number(b.topic.weight), 0);
    const score = w > 0 ? round1(counted.reduce((sum, b) => sum + Number(b.topic.weight) * b.topic.score!, 0) / w) : null;
    d = { ...input, score, history: input.history.map((h) => (h.current ? { ...h, score } : h)) };
  }
  const firstScored = blocks.findIndex(isScoredTopic);
  const before = blocks.filter((b, i) => !isScoredTopic(b) && (firstScored < 0 || i < firstScored));
  const scored = blocks.filter(isScoredTopic);
  const after = blocks.filter((b, i) => !isScoredTopic(b) && firstScored >= 0 && i > firstScored);
  const unscoredBetween = after; // témata bez bodů za hodnocenými (pozitiva/negativa, shrnutí)
  // fotky u bodovaných otázek jsou přímo u otázky, ostatní (účtenka, fotky k poznámkám) jdou do příloh
  const inline = new Set(scored.flatMap((b) => b.scored).map((r) => r.q.id));
  const appendix = d.content.attachments.filter((a) => d.images[a.id] && (!a.question_id || !inline.has(a.question_id)));
  const chrome = <PageChrome appName={d.appName} branchName={d.branchName} companyName={d.companyName} draft={!d.approved} />;

  return (
    <Document title={`${d.companyName} – ${d.branchName}`} author={d.appName}>
      <Cover d={d} blocks={blocks} />

      <Page size="A4" style={s.page}>
        {chrome}
        {before.map((b, i) => (
          <InfoTopic key={b.topic.id} b={b} first={i === 0} />
        ))}
        {scored.map((b, i) => (
          <TopicPage key={b.topic.id} b={b} d={d} first={i === 0} spaced={i === 0 && before.length > 0} />
        ))}
      </Page>

      {unscoredBetween.some((b) => b.info.length || b.texts.length) && (
        <Page size="A4" style={s.page}>
          {chrome}
          {unscoredBetween.map((b, i) => (
            <InfoTopic key={b.topic.id} b={b} first={i === 0} />
          ))}
        </Page>
      )}

      {appendix.length > 0 && (
        <Page size="A4" style={s.page}>
          {chrome}
          <Text style={[s.h2, { marginBottom: 12 }]}>Přílohy</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {appendix.map((a) => {
              const q = d.content.questions.find((x) => x.id === a.question_id);
              return (
                <View key={a.id} style={{ width: appendix.length === 1 ? "100%" : "48%", alignItems: "center" }} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image src={d.images[a.id]} style={{ maxWidth: "100%", maxHeight: appendix.length === 1 ? 600 : 300, objectFit: "contain", borderRadius: 4 }} />
                  <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>{q?.text ?? a.file_name}</Text>
                </View>
              );
            })}
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function renderReportPdf(d: PdfData) {
  ensureFonts();
  return renderToBuffer(<Report d={d} />);
}
