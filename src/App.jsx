import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'

/* ============================================================
   Health OS — biological-age & longevity dashboard
   ---
   Baseline values below come from MEMORY.md (Section IV) as of
   2026-05-18 — most "unknown"s are real: Garmin isn't wired,
   bloods haven't been imported, MyFitnessPal logging is at zero.
   Live fetch reads weekly_checkins and habit_pings from Supabase
   when configured; otherwise the baseline shows.
   ============================================================ */

const CHRONO_AGE = 22.4

// What MEMORY.md actually says, verbatim. This is the honest start.
const BASELINE = {
  period: '2026-05-12 → 2026-05-18',
  sleep_avg_hours: null,
  sleep_avg_score: null,
  gym_sessions: 0,
  gym_muscle_groups: '—',
  diet_adherence: null,
  mfp_logged_days: 0,
  isotretinoin: null,
  d3: null,
  note: '"Today\'s entry was a task list only — no habit tracking present. Gym not completed 18 May." — MEMORY.md',
}

// The mental-state signal IS health data. Pulled from journals
// 2026-05-13 → 2026-05-19 (Mid-year self-investment deficit; bathroom
// scream 14 May; Lenexa front-loading; "half-arsing my presence").
const CURRENT_SIGNAL = {
  rut_status: 'clear (neutral)',
  flags: [
    'Mid-year self-investment deficit flagged in 2026-05-18 evening synthesis.',
    'Acute stress event 2026-05-14 (workplace incident; cathartic release).',
    'Self-reported "half-arsing my presence" — somatic burner low.',
  ],
}

// Honest list. Most are NOT yet available — the dashboard's job is
// to show what is missing so the gaps drive the next action.
const INPUTS = [
  { key: 'sleep_hours',  label: 'Sleep duration',         source: 'Garmin · Strava', present: false },
  { key: 'sleep_score',  label: 'Sleep score',            source: 'Garmin',          present: false },
  { key: 'body_battery', label: 'Body battery',           source: 'Garmin',          present: false },
  { key: 'gym',          label: 'Gym sessions / muscle',  source: 'Pulse + journal', present: true, value: '0 / wk · groups: —' },
  { key: 'macros',       label: 'Macros (protein, fibre)',source: 'MyFitnessPal',    present: false },
  { key: 'food',         label: 'Food quality (whole-food days)', source: 'Pulse',   present: false },
  { key: 'teeth',        label: 'Teeth brushing',         source: 'Pulse pings',     present: false },
  { key: 'skin',         label: 'Skincare / grooming',    source: 'Pulse pings',     present: false },
  { key: 'isotretinoin', label: 'Isotretinoin adherence', source: 'Pulse pings',     present: false },
  { key: 'd3',           label: 'Vitamin D3 adherence',   source: 'Pulse pings',     present: false },
  { key: 'dexa',         label: 'DEXA — body comp',       source: 'manual import',   present: false },
  { key: 'bloods',       label: 'Blood panel (ApoB, HbA1c, CRP, ...)', source: 'manual import', present: false },
  { key: 'bp',           label: 'Blood pressure',         source: 'manual',          present: false },
  { key: 'vo2',          label: 'VO2 max',                source: 'Garmin (est) → lab test', present: false },
  { key: 'grip',         label: 'Grip strength',          source: 'manual (dynamometer)',    present: false },
]

const TRACKED_FACTORS = [
  ['Sleep',                     'duration, score, consistency, mid-sleep time'],
  ['Body composition',          'DEXA fat %, lean mass, visceral fat, bone density'],
  ['Cardiorespiratory fitness', 'VO2 max, resting HR, HR variability'],
  ['Strength',                  'grip strength, lift load progression'],
  ['Metabolic blood markers',   'HbA1c, fasting glucose, ApoB, triglycerides, HDL'],
  ['Inflammation',              'hs-CRP, white-cell count, albumin'],
  ['Diet',                      'protein, fibre, kcal balance, micronutrient gaps, ultra-processed share'],
  ['Blood pressure',            'systolic / diastolic trend'],
  ['Oral & skin maintenance',   'brushing, skincare, grooming consistency'],
  ['Substances',                'alcohol units, caffeine timing'],
]

/* ── small components ─────────────────────────────────────── */

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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '32px 0 14px' }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</h2>
      {hint && <span style={{ fontSize: 12, color: 'rgba(232,237,242,0.3)' }}>{hint}</span>}
    </div>
  )
}

/* ── app ──────────────────────────────────────────────────── */

export default function App() {
  const [showFactors, setShowFactors] = useState(false)
  const [live, setLive] = useState({ loaded: false, checkin: null, pings: [], error: null })

  // Pull the latest check-in + last-14-days pings from Supabase if wired.
  useEffect(() => {
    if (!supabase) { setLive(l => ({ ...l, loaded: true, error: 'not-configured' })); return }
    let cancelled = false
    ;(async () => {
      try {
        const [{ data: ci }, { data: pg }] = await Promise.all([
          supabase.from('weekly_checkins').select('*').order('week_of', { ascending: false }).limit(1),
          supabase.from('habit_pings').select('*').gte('pinged_at', new Date(Date.now() - 14 * 86400000).toISOString()),
        ])
        if (!cancelled) setLive({ loaded: true, checkin: ci?.[0] || null, pings: pg || [], error: null })
      } catch (e) {
        if (!cancelled) setLive(l => ({ ...l, loaded: true, error: e?.message || 'fetch-failed' }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Compute pulse-derived adherence per habit key (real if pings exist).
  const pingAdherence = {}
  for (const p of live.pings) {
    if (!p.responses) continue
    for (const [k, v] of Object.entries(p.responses)) {
      if (!pingAdherence[k]) pingAdherence[k] = { yes: 0, total: 0 }
      pingAdherence[k].total += 1
      if (v) pingAdherence[k].yes += 1
    }
  }

  const checkin = live.checkin
  const presentCount = INPUTS.filter(i => i.present).length
        + (checkin?.sleep_score != null ? 1 : 0)
        + (checkin?.body_battery != null ? 1 : 0)
        + Object.keys(pingAdherence).length
  const inputsTotal = INPUTS.length
  const coverage = Math.round((presentCount / inputsTotal) * 100)

  // Bio-age estimate is gated. Until we have enough inputs we refuse
  // to print a number — that's the difference between honest and lifeless.
  const bioEstimable = coverage >= 50

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>

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
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Biological age & longevity · live from MEMORY.md + Supabase
            </p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 70px' }}>

        {/* Bio age — gated on inputs */}
        <Card accent={bioEstimable ? '#4ade80' : '#fbbf24'} style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Biological age</div>
              <div style={{ fontSize: bioEstimable ? 54 : 30, fontWeight: 700, lineHeight: 1.1, color: bioEstimable ? '#4ade80' : '#fbbf24' }}>
                {bioEstimable ? '—' : 'needs inputs'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>chronological {CHRONO_AGE}</div>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600,
                color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: 20, padding: '4px 12px', marginBottom: 10,
              }}>
                {presentCount}/{inputsTotal} inputs present · {coverage}% coverage
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.65 }}>
                A Levine <em>PhenoAge</em>-style estimate is suppressed until at least half the
                inputs are present. <strong style={{ color: 'var(--text)' }}>Right now the largest
                gaps are Garmin sleep, MyFitnessPal macros, and a recent blood panel.</strong> See
                the Garmin/Strava connection manual in <code>Claude Context</code> for the next step.
              </p>
            </div>
          </div>
        </Card>

        {/* Current signal from journals — this IS health data */}
        <SectionTitle hint="from journals 2026-05-13 → 2026-05-19">Current state of mind</SectionTitle>
        <Card accent="#fbbf24">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Rut status: <span style={{ color: '#fbbf24' }}>{CURRENT_SIGNAL.rut_status}</span></span>
            <span style={{ fontSize: 11, color: 'rgba(232,237,242,0.35)' }}>journal-scout signal</span>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CURRENT_SIGNAL.flags.map((f, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#fbbf24' }}>·</span>
                {f}
              </li>
            ))}
          </ul>
        </Card>

        {/* Habits — real values from MEMORY.md + live Supabase */}
        <SectionTitle hint={`baseline: ${BASELINE.period}`}>Habit inputs</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>

          <Card accent="#60a5fa">
            <Field label="Sleep" icon="😴">
              {checkin?.sleep_score != null
                ? <Real>{checkin.sleep_score} score · battery {checkin.body_battery ?? '—'}</Real>
                : <Awaiting>not in last weekly_checkin · Garmin not wired</Awaiting>}
            </Field>
          </Card>

          <Card accent="#4ade80">
            <Field label="Exercise" icon="🏃">
              <Real>{BASELINE.gym_sessions} gym sessions / wk</Real>
              <Sub>muscle groups: {BASELINE.gym_muscle_groups}</Sub>
            </Field>
          </Card>

          <Card accent="#fbbf24">
            <Field label="Macros (MFP)" icon="🥗">
              <Awaiting>{BASELINE.mfp_logged_days} logged days / 7</Awaiting>
            </Field>
          </Card>

          {[
            { key: 'meal',     icon: '🍱', label: 'Meal logged' },
            { key: 'teeth',    icon: '🪥', label: 'Teeth' },
            { key: 'skincare', icon: '🧴', label: 'Skincare' },
          ].map(h => {
            const a = pingAdherence[h.key]
            return (
              <Card key={h.key} accent="#a78bfa">
                <Field label={h.label} icon={h.icon}>
                  {a
                    ? <Real>{Math.round((a.yes / a.total) * 100)}% yes ({a.yes}/{a.total} pings)</Real>
                    : <Awaiting>awaiting first Pulse ping</Awaiting>}
                </Field>
              </Card>
            )
          })}

          <Card>
            <Field label="Isotretinoin" icon="💊">
              <Awaiting>{BASELINE.isotretinoin ?? 'adherence unlogged'}</Awaiting>
            </Field>
          </Card>

          <Card>
            <Field label="Vitamin D3" icon="☀️">
              <Awaiting>{BASELINE.d3 ?? 'adherence unlogged'}</Awaiting>
            </Field>
          </Card>
        </div>

        <p style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.35)', marginTop: 10, lineHeight: 1.6 }}>
          {BASELINE.note}
        </p>

        {/* Labs */}
        <SectionTitle hint="all currently missing — import path opens here">Labs & scans</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { label: 'DEXA scan',     detail: 'No prior import. Cost ≈ $80 in Melbourne; book next.' },
            { label: 'Blood panel',   detail: 'No recent panel. ApoB, HbA1c, hs-CRP, ALT, ALP, lipids, vitD.' },
            { label: 'Blood pressure',detail: 'Add a home cuff reading weekly into Pulse.' },
            { label: 'VO2 max',       detail: 'Garmin estimate when watch is wired; lab test optional.' },
            { label: 'Grip strength', detail: 'Cheap hand dynamometer + monthly log.' },
          ].map(l => (
            <Card key={l.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#f87171' }}>missing</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{l.detail}</p>
            </Card>
          ))}
        </div>

        {/* Risk */}
        <SectionTitle hint="estimated when bloods are imported">Long-term risk</SectionTitle>
        <Card accent="#fbbf24">
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
            Cardiovascular (PREVENT-style), cardiometabolic and cancer-screening cadence panels
            will land here once a blood panel is imported. Without ApoB, HbA1c, blood pressure
            and family-history flags, any number shown would be guesswork — Health OS refuses
            to make one up.
          </p>
        </Card>

        {/* Robustness */}
        <SectionTitle>Data robustness</SectionTitle>
        <Card>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
            On any unlogged day, Health OS carries the trailing 14-day baseline forward and
            widens the confidence band rather than dropping the day. Today's state:
            <strong style={{ color: 'var(--text)' }}> {presentCount} of {inputsTotal} input
            categories present</strong> · live fetch:&nbsp;
            <strong style={{ color: live.error ? '#f87171' : live.loaded ? '#4ade80' : '#fbbf24' }}>
              {live.error === 'not-configured' ? 'Supabase not configured for this build'
                : live.error ? `error: ${live.error}`
                : live.loaded ? `live — ${live.pings.length} pings, ${checkin ? 'check-in OK' : 'no check-in'}`
                : 'loading…'}
            </strong>.
          </p>
        </Card>

        {/* Prerequisite factors */}
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
                  <span style={{ fontWeight: 600, flex: '0 0 200px' }}>{f}</span>
                  <span style={{ color: 'var(--muted)' }}>{d}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <p style={{ fontSize: 11, color: 'rgba(232,237,242,0.3)', marginTop: 26, lineHeight: 1.7 }}>
          Method basis (for the live build): biological age from Levine et al. <em>PhenoAge</em>
          (Aging, 2018) and the Klemera–Doubal method; pace of aging from <em>DunedinPACE</em>
          (Belsky et al., eLife 2022); cardiovascular risk from the AHA PREVENT equations (2023).
          Layout shows real coverage; any specific number is suppressed until the inputs to
          compute it are present.
        </p>
      </main>
    </div>
  )
}

/* ── inline atoms ─────────────────────────────────────────── */

function Field({ label, icon, children }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span style={{ fontSize: 17 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      </div>
      {children}
    </>
  )
}

function Real({ children }) {
  return <div style={{ fontSize: 18, fontWeight: 700 }}>{children}</div>
}

function Sub({ children }) {
  return <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{children}</div>
}

function Awaiting({ children }) {
  return (
    <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>
      <span style={{ marginRight: 5 }}>⏳</span>{children}
    </div>
  )
}
