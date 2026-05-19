import { useState } from 'react'

/* ============================================================
   Health OS — mock-up
   Biological-age + longevity dashboard. All data below is
   SAMPLE data for layout review — no live inputs are wired.
   ============================================================ */

const CHRONO_AGE = 22.4

// Sample biological-age estimate. The real version composes this
// from logged habits + labs using a PhenoAge-style model (see notes).
const BIO_AGE = 20.8
const PACE = 0.91 // DunedinPACE-style: years of aging per calendar year

const HABITS = [
  {
    key: 'sleep', icon: '😴', label: 'Sleep',
    value: '7.1 h', sub: 'avg · score 79', adherence: 71, accent: '#60a5fa',
    bioLink: 'Each hour below 7.5h adds ~0.4 bio-yrs (sample model).',
    series: [82, 74, 88, 61, 79, 70, 79],
  },
  {
    key: 'exercise', icon: '🏃', label: 'Exercise',
    value: '4 / wk', sub: '2 run · 1 lift · 1 court', adherence: 80, accent: '#4ade80',
    bioLink: 'Mixed zone-2 + resistance is the largest negative-age lever.',
    series: [1, 0, 1, 1, 0, 1, 0],
  },
  {
    key: 'diet', icon: '🥗', label: 'Diet — macros',
    value: '128 g protein', sub: '2,180 kcal avg · fibre 26 g', adherence: 68, accent: '#fbbf24',
    bioLink: 'Protein floor + fibre track against CRP and glucose.',
    series: [130, 96, 142, 120, 128, 110, 128],
  },
  {
    key: 'food', icon: '🍱', label: 'Food quality',
    value: 'B−', sub: 'whole-food days 4 / 7', adherence: 57, accent: '#fbbf24',
    bioLink: 'Ultra-processed share is a proxy for inflammatory load.',
    series: [1, 1, 0, 1, 0, 0, 1],
  },
  {
    key: 'teeth', icon: '🪥', label: 'Teeth',
    value: '11 / 14', sub: 'proper brush sessions', adherence: 79, accent: '#4ade80',
    bioLink: 'Oral inflammation correlates with cardiovascular risk.',
    series: [2, 1, 2, 2, 1, 1, 2],
  },
  {
    key: 'skin', icon: '🧴', label: 'Skincare & grooming',
    value: '5 / 7', sub: 'routine · isotretinoin on track', adherence: 71, accent: '#a78bfa',
    bioLink: 'Tracked for consistency signal — small direct bio-age weight.',
    series: [1, 1, 1, 0, 1, 0, 1],
  },
]

const LABS = [
  { label: 'DEXA scan', status: 'imported', detail: '14.8% body fat · 31.2 kg lean · last 2026-03-09', accent: '#4ade80' },
  { label: 'Blood panel', status: 'imported', detail: 'CRP 0.7 · HbA1c 5.1 · ApoB 78 · last 2026-04-22', accent: '#4ade80' },
  { label: 'VO2 max', status: 'pending', detail: 'Estimated 48 from Garmin — confirm with lab test', accent: '#fbbf24' },
  { label: 'Grip strength', status: 'missing', detail: 'Not logged — a cheap, strong mortality proxy', accent: '#f87171' },
]

const RISKS = [
  { label: 'Cardiovascular (10-yr)', band: 'Low', pct: 18, note: 'ApoB + BP + family history, PREVENT-style estimate.' },
  { label: 'Cardiometabolic', band: 'Low', pct: 22, note: 'HbA1c, fasting glucose, waist-to-height in range.' },
  { label: 'Cancer screening', band: 'On cadence', pct: 40, note: 'Age-appropriate: skin check due, others not yet indicated.' },
]

const TRACKED_FACTORS = [
  ['Sleep', 'duration, score, consistency, mid-sleep time'],
  ['Body composition', 'DEXA fat %, lean mass, visceral fat, bone density'],
  ['Cardiorespiratory fitness', 'VO2 max, resting HR, HR variability'],
  ['Strength', 'grip strength, lift load progression'],
  ['Metabolic blood markers', 'HbA1c, fasting glucose, ApoB, triglycerides, HDL'],
  ['Inflammation', 'hs-CRP, white-cell count, albumin'],
  ['Diet', 'protein, fibre, kcal balance, micronutrient gaps, ultra-processed share'],
  ['Blood pressure', 'systolic / diastolic trend'],
  ['Oral & skin maintenance', 'brushing, skincare, grooming consistency'],
  ['Substances', 'alcohol units, caffeine timing'],
]

/* ── small components ─────────────────────────────────────── */

function Bars({ series, accent }) {
  const max = Math.max(...series, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 26 }}>
      {series.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(8, (v / max) * 100)}%`,
          background: accent, opacity: 0.35 + 0.65 * (v / max), borderRadius: 2,
        }} />
      ))}
    </div>
  )
}

function Card({ children, accent, style }) {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderRadius: 14, borderTop: accent ? `2px solid ${accent}` : '1px solid var(--card-border)',
      padding: '18px 20px', ...style,
    }}>{children}</div>
  )
}

function SectionTitle({ children, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '34px 0 14px' }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</h2>
      {hint && <span style={{ fontSize: 12, color: 'rgba(232,237,242,0.3)' }}>{hint}</span>}
    </div>
  )
}

/* ── app ──────────────────────────────────────────────────── */

export default function App() {
  const [showFactors, setShowFactors] = useState(false)
  const delta = (CHRONO_AGE - BIO_AGE).toFixed(1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #0d1b2a, #14342b, #0f3460)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '26px 24px',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, fontSize: 19,
            background: 'linear-gradient(135deg, #4ade80, #0f3460)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>🧬</div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700 }}>Health OS</h1>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Biological age & longevity — mock-up with sample data</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px 70px' }}>

        {/* Biological age hero */}
        <Card accent="#4ade80" style={{ padding: '26px 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Biological age</div>
              <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05, color: '#4ade80' }}>{BIO_AGE}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>chronological {CHRONO_AGE}</div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
                color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                borderRadius: 20, padding: '4px 12px', marginBottom: 10,
              }}>
                ▼ {delta} years younger than calendar age
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.65 }}>
                Estimated from a Levine <em>PhenoAge</em>-style composite of logged habits and
                lab markers, with a DunedinPACE-style pace of aging of <strong style={{ color: 'var(--text)' }}>{PACE}×</strong> —
                you are currently ageing slower than one year per year. Method notes are at the
                bottom of this page; every number on this screen is sample data.
              </p>
            </div>
          </div>
        </Card>

        {/* Habits */}
        <SectionTitle hint="7-day window">Habit inputs</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {HABITS.map(h => (
            <Card key={h.key} accent={h.accent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: 18 }}>{h.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{h.label}</span>
                </div>
                <span style={{ fontSize: 12, color: h.accent, fontWeight: 600 }}>{h.adherence}%</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{h.value}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{h.sub}</div>
              <Bars series={h.series} accent={h.accent} />
              <p style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', marginTop: 10, lineHeight: 1.5 }}>{h.bioLink}</p>
            </Card>
          ))}
        </div>

        {/* Labs */}
        <SectionTitle hint="DEXA · bloods · field tests">Labs & scans</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
          {LABS.map(l => (
            <Card key={l.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: l.accent }}>{l.status}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{l.detail}</p>
            </Card>
          ))}
        </div>

        {/* Long-term risk */}
        <SectionTitle hint="reverse-engineered, peer-reviewed models">Long-term risk</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RISKS.map(r => (
            <Card key={r.label} style={{ padding: '15px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.pct < 33 ? '#4ade80' : r.pct < 66 ? '#fbbf24' : '#f87171' }}>{r.band}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                <div style={{ width: `${r.pct}%`, height: '100%', background: r.pct < 33 ? '#4ade80' : r.pct < 66 ? '#fbbf24' : '#f87171' }} />
              </div>
              <p style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)' }}>{r.note}</p>
            </Card>
          ))}
        </div>

        {/* Robustness */}
        <SectionTitle>Data robustness</SectionTitle>
        <Card accent="#fbbf24">
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
            The biological-age estimate must survive holes in journaling. When a day is
            unlogged, Health OS carries the trailing 14-day baseline forward and widens
            the confidence band rather than dropping the day. Current state:
            <strong style={{ color: 'var(--text)' }}> 2 of the last 7 days gap-filled</strong>,
            estimate confidence <strong style={{ color: 'var(--text)' }}>moderate</strong>.
            Pulse pop-up captures and Garmin/Strava sync are the inputs that keep this tight.
          </p>
        </Card>

        {/* Tracked factors */}
        <SectionTitle>Prerequisite factors to track</SectionTitle>
        <Card>
          <button
            onClick={() => setShowFactors(s => !s)}
            style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, marginBottom: showFactors ? 12 : 0 }}
          >
            {showFactors ? '▼' : '▶'} The {TRACKED_FACTORS.length} inputs the bio-age model needs
          </button>
          {showFactors && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TRACKED_FACTORS.map(([f, d]) => (
                <div key={f} style={{ display: 'flex', gap: 12, fontSize: 13, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontWeight: 600, flex: '0 0 180px' }}>{f}</span>
                  <span style={{ color: 'var(--muted)' }}>{d}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Method note */}
        <p style={{ fontSize: 11, color: 'rgba(232,237,242,0.3)', marginTop: 26, lineHeight: 1.7 }}>
          Method basis (for the live build): biological age from Levine et al. <em>PhenoAge</em>
          (Aging, 2018) and the Klemera–Doubal method; pace of aging from <em>DunedinPACE</em>
          (Belsky et al., eLife 2022); cardiovascular risk from the AHA PREVENT equations (2023).
          This mock-up shows layout and sample values only — no model is running yet.
        </p>
      </main>
    </div>
  )
}
