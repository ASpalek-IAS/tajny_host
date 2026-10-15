import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { InspectionContent } from "@/lib/inspection-data";
import { formatAnswer } from "@/lib/answer-format";
import { isScored, questionFraction } from "@/lib/types";
import { fmtDateTime, fmtScore, scoreTone } from "@/lib/format";

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

const C = {
  ink: "#1b1a18",
  ink2: "#44413c",
  muted: "#77736b",
  line: "#e2e0db",
  soft: "#f7f7f5",
  brand: "#136f61",
  good: "#1d7f4e",
  goodBg: "#e6f4ec",
  mid: "#a15c07",
  midBg: "#fdf1dc",
  bad: "#b42318",
  badBg: "#fdecea",
};

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: C.ink, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  brand: { fontSize: 8.5, color: C.brand, fontWeight: 600, marginBottom: 6 },
  h1: { fontSize: 18, fontWeight: 700 },
  sub: { fontSize: 9.5, color: C.muted, marginTop: 3 },
  logo: { maxHeight: 40, maxWidth: 130, objectFit: "contain" },
  scoreBox: { flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 14, marginBottom: 16 },
  scoreBig: { fontSize: 26, fontWeight: 700 },
  topicRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  barBg: { height: 5, backgroundColor: C.soft, borderRadius: 3, width: 120, marginHorizontal: 8 },
  topicHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.soft,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 12,
    marginBottom: 2,
  },
  q: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.line },
  num: { width: 26, color: C.muted, fontSize: 8.5 },
  qText: { flex: 1, paddingRight: 10 },
  ans: { width: 130, alignItems: "flex-end" },
  comment: { color: C.ink2, fontSize: 8.5, marginTop: 3 },
  photos: { flexDirection: "row", flexWrap: "wrap", marginTop: 5, gap: 5 },
  photo: { width: 110, height: 82, objectFit: "cover", borderRadius: 3 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
});

function toneColors(score: number | null | undefined) {
  const t = scoreTone(score);
  return t === "good" ? [C.good, C.goodBg] : t === "mid" ? [C.mid, C.midBg] : t === "bad" ? [C.bad, C.badBg] : [C.muted, C.soft];
}

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
};

function Report({ d }: { d: PdfData }) {
  const { topics, questions, answers, attachments } = d.content;
  const [scoreColor] = toneColors(d.score);
  return (
    <Document title={`${d.companyName} – ${d.branchName}`} author={d.appName}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.brand}>{d.appName.toUpperCase()} · VÝSLEDEK KONTROLY</Text>
            <Text style={s.h1}>{d.branchName}</Text>
            <Text style={s.sub}>
              {d.companyName}
              {d.branchAddress ? ` · ${d.branchAddress}` : ""}
            </Text>
            <Text style={s.sub}>
              {d.title} · návštěva {fmtDateTime(d.visitAt)}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {d.logo && <Image src={d.logo} style={s.logo} />}
        </View>

        {d.approved ? (
          <View style={s.scoreBox} wrap={false}>
            <View style={{ width: 120 }}>
              <Text style={{ fontSize: 8.5, color: C.muted }}>Celkové skóre</Text>
              <Text style={[s.scoreBig, { color: scoreColor }]}>{fmtScore(d.score)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {topics.map((t) => {
                const [c] = toneColors(t.score);
                return (
                  <View key={t.id} style={s.topicRow}>
                    <Text style={{ flex: 1 }}>{t.title}</Text>
                    <View style={s.barBg}>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: c, width: `${Math.max(0, Math.min(100, t.score ?? 0))}%` }} />
                    </View>
                    <Text style={{ width: 42, textAlign: "right" }}>{t.score === null || t.score === undefined ? "—" : `${Number(t.score).toLocaleString("cs-CZ")} %`}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={[s.scoreBox, { backgroundColor: C.midBg }]}>
            <Text style={{ color: C.mid }}>Kontrola zatím nebyla schválena – skóre se dopočítá při schválení.</Text>
          </View>
        )}

        {topics.map((t, ti) => {
          const qs = questions.filter((q) => q.topic_id === t.id).sort((a, b) => a.position - b.position);
          return (
            <View key={t.id}>
              <View style={s.topicHead} wrap={false} minPresenceAhead={40}>
                <Text style={{ fontWeight: 600 }}>
                  {ti + 1}. {t.title}
                </Text>
                {d.approved && <Text style={{ fontWeight: 600, color: toneColors(t.score)[0] }}>{fmtScore(t.score)}</Text>}
              </View>
              {qs.map((q, qi) => {
                const a = answers[q.id];
                const f = a?.fraction ?? questionFraction(q, a?.value);
                const files = attachments.filter((x) => x.question_id === q.id && d.images[x.id]);
                const isText = q.type === "long_text" || q.type === "short_text";
                const [fc, fbg] =
                  d.approved && isScored(q) && f !== null ? (f >= 1 ? [C.good, C.goodBg] : f <= 0 ? [C.bad, C.badBg] : [C.mid, C.midBg]) : [C.ink, "transparent"];
                return (
                  <View key={q.id} style={s.q} wrap={false}>
                    <Text style={s.num}>
                      {ti + 1}.{qi + 1}
                    </Text>
                    <View style={s.qText}>
                      <Text>{q.text}</Text>
                      {isText && a?.value ? <Text style={[s.comment, { color: C.ink }]}>{String(a.value)}</Text> : null}
                      {a?.comment ? <Text style={s.comment}>Komentář: {a.comment}</Text> : null}
                      {files.length > 0 && (
                        <View style={s.photos}>
                          {files.slice(0, 6).map((x) => (
                            // eslint-disable-next-line jsx-a11y/alt-text
                            <Image key={x.id} src={d.images[x.id]} style={s.photo} />
                          ))}
                        </View>
                      )}
                    </View>
                    {!isText && (
                      <View style={s.ans}>
                        <Text style={{ fontWeight: 600, color: fc, backgroundColor: fbg, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                          {q.type === "file" ? `${attachments.filter((x) => x.question_id === q.id).length} soubor(ů)` : formatAnswer(q, a?.value)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text>
            {d.companyName} – {d.branchName}
            {d.approvedAt ? ` · schváleno ${fmtDateTime(d.approvedAt)}` : ""}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(d: PdfData) {
  ensureFonts();
  return renderToBuffer(<Report d={d} />);
}
