// Logo preview surface — not linked from anywhere in the app. Renders both
// marks large enough to judge, plus a size ladder down to the sizes they
// actually ship at, since every problem with these has shown up at the small
// end rather than the large one.
//
// Deliberately outside the (user) route group so there's no nav, no games strip
// and no auth gate — just the marks on a clean field.
import Logo from "@/components/Logo";
import LogoWordmark from "@/components/LogoWordmark";

const LADDER = [64, 48, 32, 28, 20];

const SWATCHES: Array<{ label: string; bg: string }> = [
  { label: "surface", bg: "var(--surface)" },
  { label: "page", bg: "var(--bg-2, #F4F5F7)" },
  { label: "near-black", bg: "var(--text)" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 64 }}>
      <div className="section-title" style={{ marginBottom: 20 }}>{title}</div>
      {children}
    </section>
  );
}

export default function LogoPreviewPage() {
  return (
    <div className="page-wide" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 className="display-2" style={{ marginBottom: 8 }}>Logo</h1>
        <p className="lede" style={{ marginBottom: 56 }}>
          Both marks at size. <code>components/Logo.tsx</code> is what the app
          uses; <code>components/LogoWordmark.tsx</code> is the wordmark test.
        </p>

        <Section title="Mark — very large">
          <Logo size={360} />
        </Section>

        <Section title="Wordmark — very large">
          <LogoWordmark height={132} />
        </Section>

        <Section title="Mark — size ladder">
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
            {LADDER.map((s) => (
              <div key={s} style={{ textAlign: "center" }}>
                <Logo size={s} />
                <div className="eyebrow" style={{ marginTop: 8 }}>{s}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Wordmark — size ladder">
          <div style={{ display: "flex", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
            {LADDER.map((s) => (
              <div key={s} style={{ textAlign: "center" }}>
                <LogoWordmark height={s} />
                <div className="eyebrow" style={{ marginTop: 8 }}>{s}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="On the app's surfaces">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {SWATCHES.map(({ label, bg }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                <Logo size={40} />
                <LogoWordmark height={28} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
