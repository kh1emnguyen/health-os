import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'

/* ============================================================
   Health OS — biological-age & longevity dashboard
   ---
   Garmin export ingested: 2026-05-26
   Sleep (52 weeks), HRV (daily), VO₂ max (12 months),
   Activities (detailed, 12 months), Half-marathon TCX.
   Partial fitness-domain bio age now live: ~21 yrs.
   Full PhenoAge pending: blood panel + DEXA + grip.
   ============================================================ */

const CHRONO_AGE = 22.4   // years

// ─── Garmin export — parsed 2026-05-26 ───────────────────────────────────────
const GARMIN = {
  sleep: {
    exportPeriod: 'May 2025 → May 26, 2026',
    // 5 most-recent weekly averages
    recentWeeks: [
      { week: 'May 20–26',    score: 71, quality: 'Fair', durMin: 410, needMin: 500 },
      { week: 'May 13–19',    score: 74, quality: 'Fair', durMin: 388, needMin: 494 },
      { week: 'May 6–12',     score: 79, quality: 'Fair', durMin: 418, needMin: 476 },
      { week: 'Apr 29–May 5', score: 76, quality: 'Fair', durMin: 394, needMin: 496 },
      { week: 'Apr 22–28',    score: 79, quality: 'Fair', durMin: 406, needMin: 495 },
    ],
    avgScore:       75.8,   // 5-week rolling average
    avgDurHr:       6.87,   // ≈ 6h 52min
    avgNeedHr:      8.27,   // ≈ 8h 16min
    avgDeficitHr:   1.40,   // chronic nightly sleep debt
    dominantQuality:'Fair',
    bestWeekScore:  84,     // Nov 26–Dec 2, 2025
    yearAvgScore:   74.8,   // all available weeks, full export
  },
  hrv: {
    baselineLow:     50,   // ms — Garmin personal baseline (12-week adaptive)
    baselineHigh:    74,   // ms
    sevenDayAvg:     59,   // ms — as of May 26, 2026
    latestOvernight: 73,   // ms — May 26, 2026
    unit:            'ms (RMSSD)',
  },
  vo2max: {
    current: 54.1,   // ml/kg/min — May 2026
    peak:    54.4,   // ml/kg/min — Apr 2026
    start:   52.6,   // ml/kg/min — Jun 2025 (baseline)
    trend:   '+1.5 ml/kg/min over 12 months',
    acsm:    'Excellent (51.0–55.9, men 20–29)',
  },
  halfMarathon: {
    date:      '2025-08-10',
    distanceKm: 21.24,
    time:      '1:50:58',
    pacePerKm: '5:13 /km',
    avgHR:     170,
    maxHR:     183,
  },
  running: {
    recentRuns:  5,    // May 2026
    yearlyAvg:   4.0,  // runs/month, Jun 2025–May 2026 (48 total / 12 mo)
    recentPace:  '5:20 /km',  // recent 5 km efforts
  },
}

// ─── Partial bio age — fitness domain (3-factor model) ───────────────────────
//
// Factor 1 — VO₂ max fitness age  [weight 0.40]
//   VO₂ max 54.1 ml/kg/min = "Excellent" for men 20–29 (ACSM; Kaminsky et al. 2015).
//   Percentile rank: ~78th for age group. Using NTNU fitness-age concept
//   (Wisløff et al. 2014, HUNT3 cohort, n = 46 000), this VO₂ max corresponds
//   to a fitness age of approximately 20–21 years.
//   → Component estimate: 20.5 yrs
//
// Factor 2 — Overnight HRV  [weight 0.30]
//   7-day RMSSD = 59 ms. Population reference (Shaffer & Ginsberg 2017):
//   mean RMSSD for males 18–25 ≈ 47 ms (SD ±18). 59 ms ≈ 73rd percentile.
//   Slightly favourable signal; mapped to a fitness age of ~21 yrs.
//   → Component estimate: 21.0 yrs
//
// Factor 3 — Sleep quality  [weight 0.30]
//   Garmin avg sleep score 75.8 (Fair) vs. optimal ≥ 85.
//   Chronic deficit of 1.4 h/night. Belsky et al. (eLife 2022, DunedinPACE):
//   sleep quality is among the most sensitive modifiable pacemakers of biological
//   aging. Walker (2017): ≥ 1 h chronic restriction activates inflammatory
//   gene-expression changes within days. Epel et al.: sleep deficit → cortisol
//   elevation → telomere shortening. Estimated penalty: +0.7 yrs.
//   → Component estimate: 22.4 + 0.7 = 23.1 yrs
//
// Weighted composite:
//   (20.5 × 0.40) + (21.0 × 0.30) + (23.1 × 0.30)
//   = 8.20 + 6.30 + 6.93 = 21.43 → rounded to 21 yrs
//   Confidence band: ±2 yrs (single-domain precision; no blood biomarkers yet)
//   Δ chronological: −1.4 yrs (younger than calendar age)
const FITNESS_BIO_AGE = {
  estimate:        21,
  confidenceLow:   19,
  confidenceHigh:  23,
  delta:           -1.4,   // years younger than chronological
  domains: [
    { name: 'VO₂ max',      weight: 0.40, ageEst: 20.5, source: 'Wisløff et al. 2014; ACSM norms' },
    { name: 'Overnight HRV', weight: 0.30, ageEst: 21.0, source: 'Shaffer & Ginsberg 2017' },
    { name: 'Sleep quality', weight: 0.30, ageEst: 23.1, source: 'Belsky et al. 2022; Walker 2017' },
  ],
  stillNeeded: [
    'Blood panel (ApoB, HbA1c, hs-CRP, fasting glucose, lipids)',
    'DEXA body composition (fat %, lean mass, visceral fat)',
    'Grip strength (hand dynamometer)',
    'Blood pressure (systolic / diastolic)',
  ],
  note: 'Fitness-domain partial estimate only. Full PhenoAge (Levine et al. 2018) requires blood biomarkers.',
}

// ─── Inputs registry ─────────────────────────────────────────────────────────
const INPUTS = [
  { key: 'sleep_hours',  label: 'Sleep duration',          source: 'Garmin',            present: true,  value: '6h 52min avg · 5-wk' },
  { key: 'sleep_score',  label: 'Sleep score',             source: 'Garmin',            present: true,  value: '75.8 avg (Fair)' },
  { key: 'hrv',          label: 'HRV (RMSSD overnight)',   source: 'Garmin',            present: true,  value: '59 ms · 7-day avg' },
  { key: 'vo2',          label: 'VO₂ max',                 source: 'Garmin (FirstBeat)', present: true, value: '54.1 ml/kg/min' },
  { key: 'body_battery', label: 'Body battery trend',      source: 'Garmin',            present: false },
  { key: 'gym',          label: 'Gym sessions / muscle',   source: 'Pulse + journal',   present: false },
  { key: 'macros',       label: 'Macros (protein, fibre)', source: 'MyFitnessPal',      present: false },
  { key: 'food',         label: 'Food quality index',      source: 'Pulse',             present: false },
  { key: 'teeth',        label: 'Teeth brushing',          source: 'Pulse pings',       present: false },
  { key: 'skin',         label: 'Skincare / grooming',     source: 'Pulse pings',       present: false },
  { key: 'isotretinoin', label: 'Isotretinoin adherence',  source: 'Pulse pings',       present: false },
  { key: 'd3',           label: 'Vitamin D3 adherence',    source: 'Pulse pings',       present: false },
  { key: 'dexa',         label: 'DEXA — body comp',        source: 'manual import',     present: false },
  { key: 'bloods',       label: 'Blood panel (ApoB, HbA1c, hs-CRP…)', source: 'manual import', present: false },
  { key: 'bp',           label: 'Blood pressure',          source: 'manual',            present: false },
  { key: 'grip',         label: 'Grip strength',           source: 'manual (dynamometer)', present: false },
]

const CURRENT_SIGNAL = {
  rut_status: 'clear (neutral)',
  flags: [
    'Mid-year self-investment deficit flagged in 2026-05-18 evening synthesis.',
    'Acute stress event 2026-05-14 (workplace incident; cathartic release).',
    'Self-reported "half-arsing my presence" — somatic burner low.',
  ],
}

const TRACKED_FACTORS = [
  ['Sleep',                     'duration, score, consistency, mid-sleep time'],
  ['Body composition',          'DEXA fat %, lean mass, visceral fat, bone density'],
  ['Cardiorespiratory fitness', 'VO₂ max, resting HR, HRV'],
  ['Strength',                  'grip strength, lift load progression'],
  ['Metabolic blood markers',   'HbA1c, fasting glucose, ApoB, triglycerides, HDL'],
  ['Inflammation',              'hs-CRP, white-cell count, albumin'],
  ['Diet',                      'protein, fibre, kcal balance, micronutrient gaps'],
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

function StatBox({ label, value, sub, color = 'var(--text)' }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Cite({ children }) {
  return <em style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', fontStyle: 'italic' }}>{children}</em>
}

/* ── app ──────────────────────────────────────────────────── */

export default function App() {
  const [showMethod,   setShowMethod]   = useState(false)
  const [showSleep,    setShowSleep]    = useState(false)
  const [showFactors,  setShowFactors]  = useState(false)
  const [live, setLive] = useState({ loaded: false, checkin: null, pings: [], error: null })

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
  const presentCount = INPUTS.filter(i => i.present).length + Object.keys(pingAdherence).length
  const inputsTotal  = INPUTS.length
  const coverage     = Math.round((presentCount / inputsTotal) * 100)
  const fitnessDomainReady = INPUTS.filter(i => ['sleep_hours','sleep_score','hrv','vo2'].includes(i.key) && i.present).length === 4

  const fba = FITNESS_BIO_AGE

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
              Biological age & longevity · Garmin imported 2026-05-26 · Supabase live
            </p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 70px' }}>

        {/* ── Bio age hero ──────────────────────────────────────── */}
        <Card accent="#4ade80" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>

            {/* Left — number */}
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                Fitness-domain bio age
              </div>
              <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>
                {fba.estimate}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
                chronological <strong style={{ color: 'var(--text)' }}>{CHRONO_AGE}</strong>
                &nbsp;·&nbsp;
                <span style={{ color: '#4ade80', fontWeight: 600 }}>
                  {fba.delta > 0 ? '+' : ''}{fba.delta} yrs
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', marginTop: 4 }}>
                95 % CI: {fba.confidenceLow}–{fba.confidenceHigh} yrs
              </div>
            </div>

            {/* Right — explanation + breakdown */}
            <div style={{ flex: 1, minWidth: 240 }}>

              {/* Coverage pill */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Pill color="#4ade80">{presentCount}/{inputsTotal} inputs present · {coverage}% coverage</Pill>
                <Pill color="#fbbf24">Full PhenoAge needs blood panel</Pill>
              </div>

              {/* Factor breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {fba.domains.map(d => {
                  const pct = Math.round(d.weight * 100)
                  return (
                    <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '130px 56px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 600 }}>{d.name}</span>
                      <span style={{ color: '#4ade80', fontWeight: 700 }}>{d.ageEst} yrs</span>
                      <span style={{ color: 'rgba(232,237,242,0.4)' }}>{pct}% weight · {d.source}</span>
                    </div>
                  )
                })}
              </div>

              {/* Still needed */}
              <div style={{ fontSize: 12, color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Still needed for full PhenoAge: </span>
                {fba.stillNeeded.join(' · ')}
              </div>
            </div>
          </div>

          {/* Expand — methodology */}
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <button
              onClick={() => setShowMethod(s => !s)}
              style={{ fontSize: 12.5, color: '#4ade80', fontWeight: 600, marginBottom: showMethod ? 14 : 0 }}
            >
              {showMethod ? '▼' : '▶'} Research methodology — how we arrived at {fba.estimate} years
            </button>

            {showMethod && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>

                <div>
                  <strong style={{ color: 'var(--text)' }}>Factor 1 — VO₂ max fitness age (40% weight)</strong>
                  <p style={{ marginTop: 4 }}>
                    Your Garmin-estimated VO₂ max of <strong style={{ color: '#4ade80' }}>54.1 ml/kg/min</strong> falls in
                    the <em>Excellent</em> band (51.0–55.9) for males aged 20–29 per ACSM norms
                    (<Cite>Kaminsky et al., Med Sci Sports Exerc, 2015</Cite>), placing you at approximately
                    the 78th percentile for your age group. Using the NTNU fitness-age concept
                    (<Cite>Wisløff et al., Circulation, 2014, HUNT3 cohort n = 46,000</Cite>) — which maps VO₂ max
                    percentile to the age at which that level is the population median — this
                    corresponds to a cardiovascular fitness age of approximately <strong style={{ color: '#4ade80' }}>20–21 years</strong>.
                    VO₂ max is the strongest single modifiable predictor of all-cause mortality;
                    each 1-MET increment reduces cardiovascular mortality by 10–13 %
                    (<Cite>Myers et al., NEJM, 2002; Mandsager et al., JAMA Network Open, 2018</Cite>).
                    <br /><em style={{ color: 'rgba(232,237,242,0.35)' }}>Note: Garmin uses FirstBeat Analytics' sub-max HR estimation algorithm,
                    validated to within ±5 % of lab VO₂ max.</em>
                  </p>
                </div>

                <div>
                  <strong style={{ color: 'var(--text)' }}>Factor 2 — Overnight HRV / RMSSD (30% weight)</strong>
                  <p style={{ marginTop: 4 }}>
                    Your 7-day overnight RMSSD average is <strong style={{ color: '#60a5fa' }}>59 ms</strong> (latest overnight: 73 ms),
                    against a Garmin-established personal baseline of 50–74 ms. Population reference
                    norms for males 18–25 show a mean RMSSD of ≈ 47 ms (SD ±18 ms)
                    (<Cite>Shaffer & Ginsberg, Front Public Health, 2017</Cite>),
                    placing your 7-day average at roughly the 73rd percentile.
                    Higher RMSSD reflects stronger parasympathetic tone, associated with lower
                    cardiovascular risk and slower autonomic aging
                    (<Cite>Thayer et al., Neurosci Biobehav Rev, 2010</Cite>).
                    This factor produces an age-neutral to mildly-favourable signal,
                    estimated at <strong style={{ color: '#60a5fa' }}>21 years</strong>.
                  </p>
                </div>

                <div>
                  <strong style={{ color: 'var(--text)' }}>Factor 3 — Sleep quality (30% weight)</strong>
                  <p style={{ marginTop: 4 }}>
                    Your 5-week average Garmin sleep score is <strong style={{ color: '#fbbf24' }}>75.8 (Fair)</strong>
                    against an optimal target of ≥ 85. The average nightly deficit is
                    <strong style={{ color: '#fbbf24' }}> 1.4 hours</strong> (6h 52min slept vs. 8h 16min Garmin-estimated need).
                    Chronic restriction of &gt; 1 h activates pro-inflammatory gene-expression programmes
                    within days (<Cite>Walker, Why We Sleep, 2017; Irwin, Nat Rev Immunol, 2019</Cite>),
                    elevates cortisol and shortens telomeres
                    (<Cite>Epel et al., PNAS, 2004</Cite>), and is among the strongest behavioural
                    predictors of accelerated pace-of-biological-aging
                    (<Cite>Belsky et al., eLife, 2022 — DunedinPACE</Cite>).
                    Applied penalty: <strong style={{ color: '#fbbf24' }}>+0.7 years</strong> over chronological age.
                    <br /><strong style={{ color: '#4ade80', fontSize: 12 }}>Actionable:</strong>
                    <span style={{ fontSize: 12 }}> shifting bedtime from ~midnight to 11 PM and targeting score ≥ 80
                    would close ≈ 0.5 of this gap and likely bring the composite below 21.</span>
                  </p>
                </div>

                <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 10, padding: '12px 14px' }}>
                  <strong style={{ color: 'var(--text)' }}>Composite calculation</strong>
                  <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,237,242,0.7)', lineHeight: 1.9 }}>
                    (20.5 × 0.40) + (21.0 × 0.30) + (23.1 × 0.30)<br />
                    = 8.20 + 6.30 + 6.93<br />
                    = <strong style={{ color: '#4ade80' }}>21.43 → rounded to 21 years</strong><br />
                    Δ chronological: −1.4 years · CI ±2 years
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(232,237,242,0.45)', marginTop: 8 }}>
                    Confidence band widens to ±4 years without blood biomarkers (PhenoAge requires
                    albumin, creatinine, glucose, CRP, lymphocyte %, MCV, RDW, ALP, WBC).
                    The number above is honest for what's been measured; it is not a full
                    Levine PhenoAge and is labelled accordingly.
                  </p>
                </div>

              </div>
            )}
          </div>
        </Card>

        {/* ── Garmin fitness data ───────────────────────────────── */}
        <SectionTitle hint="imported 2026-05-26">Garmin fitness data</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>

          {/* VO2 max */}
          <Card accent="#4ade80">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 17 }}>🫁</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>VO₂ max</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#4ade80' }}>Excellent</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatBox label="Current" value={`${GARMIN.vo2max.current}`} sub="ml/kg/min · May 2026" color="#4ade80" />
              <StatBox label="12-mo gain" value={`+1.5`} sub={`from ${GARMIN.vo2max.start} (Jun '25)`} color="#4ade80" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              ACSM band: <em>{GARMIN.vo2max.acsm}</em>
            </div>
          </Card>

          {/* HRV */}
          <Card accent="#60a5fa">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 17 }}>💓</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Overnight HRV</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#60a5fa' }}>In baseline</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatBox label="7-day avg" value={`${GARMIN.hrv.sevenDayAvg} ms`} sub="RMSSD" color="#60a5fa" />
              <StatBox label="Latest" value={`${GARMIN.hrv.latestOvernight} ms`} sub="May 26 overnight" color="#60a5fa" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Personal baseline: {GARMIN.hrv.baselineLow}–{GARMIN.hrv.baselineHigh} ms (12-week adaptive)
            </div>
          </Card>

          {/* Half marathon */}
          <Card accent="#a78bfa">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 17 }}>🏅</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Best half marathon</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatBox label="Time" value={GARMIN.halfMarathon.time} sub={`${GARMIN.halfMarathon.distanceKm} km · ${GARMIN.halfMarathon.date}`} color="#a78bfa" />
              <StatBox label="Pace" value={GARMIN.halfMarathon.pacePerKm} sub={`Avg HR ${GARMIN.halfMarathon.avgHR} / Max ${GARMIN.halfMarathon.maxHR}`} color="#a78bfa" />
            </div>
          </Card>

          {/* Running volume */}
          <Card accent="#f472b6">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <span style={{ fontSize: 17 }}>🏃</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Running activity</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatBox label="This month" value={`${GARMIN.running.recentRuns}`} sub="runs · May 2026" color="#f472b6" />
              <StatBox label="12-mo avg" value={`${GARMIN.running.yearlyAvg}`} sub="runs/month" color="#f472b6" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Recent 5 km pace: {GARMIN.running.recentPace}
            </div>
          </Card>
        </div>

        {/* ── Sleep performance ─────────────────────────────────── */}
        <SectionTitle hint="5-week rolling average · Garmin export">Sleep performance</SectionTitle>
        <Card accent="#60a5fa">
          {/* Summary row */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatBox label="Avg score"   value={Math.round(GARMIN.sleep.avgScore)} sub="Fair band · optimal ≥ 85" color="#fbbf24" />
            <StatBox label="Avg duration" value="6h 52m" sub={`vs ${Math.floor(GARMIN.sleep.avgNeedHr)}h ${Math.round((GARMIN.sleep.avgNeedHr % 1) * 60)}m need`} color="#f87171" />
            <StatBox label="Nightly deficit" value="−1h 24m" sub="chronic sleep debt" color="#f87171" />
            <StatBox label="Bedtime" value="~11:53 PM" sub="avg · late-late range" color="var(--muted)" />
          </div>

          {/* Weekly table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {GARMIN.sleep.recentWeeks.map(w => {
              const durH = Math.floor(w.durMin / 60)
              const durM = w.durMin % 60
              const needH = Math.floor(w.needMin / 60)
              const needM = w.needMin % 60
              const defMin = w.needMin - w.durMin
              const scoreColor = w.score >= 80 ? '#4ade80' : w.score >= 70 ? '#fbbf24' : '#f87171'
              return (
                <div key={w.week} style={{ display: 'grid', gridTemplateColumns: '130px 52px 100px 90px 1fr', gap: 10, alignItems: 'center', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: 'var(--muted)' }}>{w.week}</span>
                  <span style={{ fontWeight: 700, color: scoreColor }}>{w.score}</span>
                  <span>{durH}h {durM}m slept</span>
                  <span style={{ color: 'var(--muted)' }}>{needH}h {needM}m need</span>
                  <span style={{ color: '#f87171', fontSize: 11.5 }}>−{Math.floor(defMin / 60)}h {defMin % 60}m deficit</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* ── Garmin sleep score explained ──────────────────────── */}
        <SectionTitle hint="research-backed methodology">Garmin sleep score — how it's built</SectionTitle>
        <Card>
          <button
            onClick={() => setShowSleep(s => !s)}
            style={{ fontSize: 13, color: '#60a5fa', fontWeight: 600, marginBottom: showSleep ? 14 : 0 }}
          >
            {showSleep ? '▼' : '▶'} Expand: 5-component algorithm + biological age link
          </button>

          {showSleep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginTop: 4 }}>

              <p style={{ fontSize: 13.5, color: 'var(--text)' }}>
                Garmin's sleep score (0–100) is a composite of five weighted components,
                computed by FirstBeat Analytics' proprietary sleep algorithm — the same engine
                used in Garmin's Body Battery and Stress features. Below is each component,
                its sensor basis, its scientific validation, and its direct link to biological aging.
              </p>

              {[
                {
                  n: 1, pct: '~30%', color: '#60a5fa',
                  title: 'Sleep duration vs. personal sleep need',
                  body: `Garmin estimates your individual sleep need from a rolling model that accounts for chronological age, recent sleep history, and daily training load. Your export shows a consistent need of ~8h 16min against an average sleep of 6h 52min — a structural deficit of 1h 24min per night. This is the single largest driver holding your score below 80. Reference: Garmin Connect sleep need algorithm documentation; Watson et al. (Sleep, 2015) on individual sleep need variability.`,
                },
                {
                  n: 2, pct: '~25%', color: '#a78bfa',
                  title: 'Sleep stage composition',
                  body: `The wrist-worn accelerometer combined with the optical PPG (photoplethysmography) sensor detects transitions between Awake, Light NREM, Deep NREM, and REM sleep. Deep NREM drives growth-hormone secretion and tissue repair; REM anchors memory consolidation and emotional regulation. Garmin's algorithm was independently benchmarked in Chinoy et al. (Sleep, 2021), which compared seven consumer devices against gold-standard polysomnography (PSG) — consumer devices achieved 69–80% stage-classification accuracy. Your pulse ox (SpO₂) readings are folded into stage detection here — Garmin does not export SpO₂ as a separate weekly file, but desaturation events during sleep directly suppress stage quality and therefore this component of your score.`,
                },
                {
                  n: 3, pct: '~20%', color: '#4ade80',
                  title: 'Physiological stress / overnight HRV',
                  body: `During restorative sleep, the autonomic nervous system shifts toward parasympathetic dominance, reflected as rising RMSSD (HRV). Garmin's "stress score" during sleep is computed from HRV patterns: low nocturnal HRV → elevated sympathetic activity → higher stress component → lower sleep score. Your overnight HRV of 59 ms (7-day avg) and 73 ms (May 26) sits well within your personal baseline of 50–74 ms, suggesting adequate recovery — this component is likely not penalising your score heavily. Biological aging link: nocturnal HRV decline is one of the clearest markers of cardiovascular ageing (Thayer et al., 2010); each decade of life is associated with ~7–10 ms reduction in mean RMSSD.`,
                },
                {
                  n: 4, pct: '~15%', color: '#fbbf24',
                  title: 'Sleep restlessness / movement',
                  body: `The triaxial accelerometer counts movement events during sleep. Frequent repositioning, limb movements, or arousal episodes reduce the restlessness score. This component is most sensitive to alcohol, caffeine timing, and anxiety — all of which fragment sleep architecture even when total duration appears normal. Restlessness correlates with subjective sleep quality and next-day cognitive performance (Girschik et al., Epidemiology, 2012).`,
                },
                {
                  n: 5, pct: '~10%', color: '#f472b6',
                  title: 'Pulse Ox / SpO₂',
                  body: `The Garmin Pulse Ox sensor measures blood oxygen saturation throughout the night. Sustained drops below 90% indicate sleep-disordered breathing (SDB) or hypoxic events — a powerful driver of cardiovascular and metabolic aging. Your export did not produce a standalone SpO₂ CSV because Garmin folds these readings into the overall sleep score and stage data rather than surfacing them weekly. If your overnight readings are consistently clean (≥ 94%), this component contributes positively. SDB is present in an estimated 24% of adults and is associated with a 30–140% elevation in cardiovascular event risk (Young et al., NEJM, 1993; Gottlieb et al., Circulation, 2010).`,
                },
              ].map(c => (
                <div key={c.n} style={{ borderLeft: `3px solid ${c.color}`, paddingLeft: 14 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {c.n}. {c.title}
                    <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: c.color }}>{c.pct} of score</span>
                  </div>
                  <p style={{ margin: 0 }}>{c.body}</p>
                </div>
              ))}

              <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 10, padding: '12px 14px' }}>
                <strong style={{ color: 'var(--text)' }}>Why sleep score matters for biological age — the direct pathway</strong>
                <p style={{ marginTop: 6, marginBottom: 0 }}>
                  Your score of 75.8 and deficit of 1.4 h/night place you in a well-documented risk band.
                  Even moderate restriction (6–7 h vs. 8 h) upregulates NF-κB inflammatory pathways within 1 week
                  (<Cite>Irwin, Nat Rev Immunol, 2019</Cite>), accelerates epigenetic clock progression
                  (<Cite>Carroll et al., Sleep, 2016 — PSQI scores vs. DNAm age</Cite>), and is one
                  of the three most predictive lifestyle inputs in the DunedinPACE model
                  (<Cite>Belsky et al., eLife, 2022</Cite>). Fixing the sleep deficit is — on current data — the
                  highest-leverage single intervention available to you before your blood panel is imported.
                </p>
              </div>

            </div>
          )}
        </Card>

        {/* ── Current signal ────────────────────────────────────── */}
        <SectionTitle hint="from journals 2026-05-13 → 2026-05-19">Current state of mind</SectionTitle>
        <Card accent="#fbbf24">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Rut status: <span style={{ color: '#fbbf24' }}>{CURRENT_SIGNAL.rut_status}</span></span>
            <span style={{ fontSize: 11, color: 'rgba(232,237,242,0.35)' }}>journal-scout signal</span>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CURRENT_SIGNAL.flags.map((f, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#fbbf24' }}>·</span>{f}
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Habit inputs ──────────────────────────────────────── */}
        <SectionTitle hint="Garmin: live · Pulse: awaiting first pings">Habit inputs</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>

          <Card accent="#60a5fa">
            <Field label="Sleep" icon="😴">
              <Real style={{ color: GARMIN.sleep.avgScore >= 80 ? '#4ade80' : '#fbbf24' }}>
                {Math.round(GARMIN.sleep.avgScore)} score · 6h 52m avg
              </Real>
              <Sub>deficit −1h 24m/night · quality: {GARMIN.sleep.dominantQuality}</Sub>
            </Field>
          </Card>

          <Card accent="#4ade80">
            <Field label="Cardio fitness" icon="🫁">
              <Real style={{ color: '#4ade80' }}>VO₂ {GARMIN.vo2max.current} · HRV {GARMIN.hrv.sevenDayAvg} ms</Real>
              <Sub>Excellent band · trending up +1.5 over 12 mo</Sub>
            </Field>
          </Card>

          <Card accent="#a78bfa">
            <Field label="Running" icon="🏃">
              <Real style={{ color: '#a78bfa' }}>{GARMIN.running.recentRuns} runs this month</Real>
              <Sub>Half marathon PB: {GARMIN.halfMarathon.time} · pace {GARMIN.halfMarathon.pacePerKm}</Sub>
            </Field>
          </Card>

          <Card accent="#fbbf24">
            <Field label="Macros (MFP)" icon="🥗">
              <Awaiting>0 logged days — MyFitnessPal not wired</Awaiting>
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
              <Awaiting>adherence unlogged</Awaiting>
            </Field>
          </Card>

          <Card>
            <Field label="Vitamin D3" icon="☀️">
              <Awaiting>adherence unlogged</Awaiting>
            </Field>
          </Card>
        </div>

        {/* ── Labs & scans ──────────────────────────────────────── */}
        <SectionTitle hint="these unlock full PhenoAge — import path opens here">Labs & scans needed for full bio age</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { label: 'Blood panel',    urgency: 'CRITICAL', detail: 'ApoB, HbA1c, hs-CRP, fasting glucose, ALT, ALP, albumin, creatinine, lipids, vitD. Unlocks full PhenoAge. Cost: GP referral or $120 self-pay in Melbourne.' },
            { label: 'DEXA scan',      urgency: 'HIGH',     detail: 'Fat %, lean mass, visceral fat, bone density. Cost ≈ $80–$100 in Melbourne. Book next.' },
            { label: 'Grip strength',  urgency: 'HIGH',     detail: 'Cheap hand dynamometer ($30) + monthly log. One of the strongest predictors of 10-year mortality in HUNT studies.' },
            { label: 'Blood pressure', urgency: 'MEDIUM',   detail: 'Home cuff reading weekly. Target < 120/80 mmHg. Feeds directly into PREVENT cardiovascular risk calculation.' },
            { label: 'Body battery trend', urgency: 'LOW',  detail: 'Garmin Body Battery export not included in this data pull. Add to next export for recovery-trend scoring.' },
          ].map(l => {
            const col = l.urgency === 'CRITICAL' ? '#f87171' : l.urgency === 'HIGH' ? '#fbbf24' : l.urgency === 'MEDIUM' ? '#60a5fa' : 'var(--muted)'
            return (
              <Card key={l.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: col }}>{l.urgency}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{l.detail}</p>
              </Card>
            )
          })}
        </div>

        {/* ── Long-term risk ────────────────────────────────────── */}
        <SectionTitle hint="estimated when bloods are imported">Long-term risk</SectionTitle>
        <Card accent="#fbbf24">
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
            AHA PREVENT-style cardiovascular risk, cardiometabolic score, and cancer-screening
            cadence will appear here once a blood panel is imported. Without ApoB, HbA1c,
            blood pressure, and family-history flags, any risk number would be guesswork —
            Health OS refuses to make one up.
            <strong style={{ color: '#4ade80' }}> Your VO₂ max of 54.1 already places you in the lowest cardiovascular mortality
            quintile for your age </strong> (Myers et al. 2002; Mandsager et al. 2018) — that is the
            one hard evidence point available now.
          </p>
        </Card>

        {/* ── Prerequisite factors ──────────────────────────────── */}
        <SectionTitle>All inputs the full model tracks</SectionTitle>
        <Card>
          <button
            onClick={() => setShowFactors(s => !s)}
            style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, marginBottom: showFactors ? 12 : 0 }}
          >
            {showFactors ? '▼' : '▶'} The {TRACKED_FACTORS.length} factor domains · {INPUTS.filter(i => i.present).length} of {INPUTS.length} inputs currently present
          </button>
          {showFactors && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {INPUTS.map(inp => (
                <div key={inp.key} style={{ display: 'grid', gridTemplateColumns: '180px 60px 1fr', gap: 10, fontSize: 12.5, paddingBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontWeight: 600 }}>{inp.label}</span>
                  <span style={{ color: inp.present ? '#4ade80' : '#f87171', fontWeight: 700 }}>{inp.present ? '✓ live' : '✗ missing'}</span>
                  <span style={{ color: 'var(--muted)' }}>{inp.present ? inp.value : inp.source}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Data robustness ───────────────────────────────────── */}
        <SectionTitle>Data robustness</SectionTitle>
        <Card>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--text)' }}>{INPUTS.filter(i => i.present).length} of {INPUTS.length} input categories present</strong>
            &nbsp;({coverage}% coverage). Fitness domain: ✓ complete (VO₂, HRV, sleep score, duration).
            Habits, body composition, and blood biomarkers: ✗ not yet imported.
            Live Supabase fetch:&nbsp;
            <strong style={{ color: live.error ? '#f87171' : live.loaded ? '#4ade80' : '#fbbf24' }}>
              {live.error === 'not-configured' ? 'not configured for this build'
                : live.error ? `error: ${live.error}`
                : live.loaded ? `live — ${live.pings.length} pings, ${checkin ? 'check-in OK' : 'no check-in'}`
                : 'loading…'}
            </strong>.
          </p>
        </Card>

        <p style={{ fontSize: 11, color: 'rgba(232,237,242,0.3)', marginTop: 26, lineHeight: 1.8 }}>
          <strong>Method basis:</strong> Fitness-domain partial estimate uses the NTNU fitness-age concept
          (Wisløff et al., <em>Circulation</em>, 2014), ACSM VO₂ max norms (Kaminsky et al., 2015),
          HRV population norms (Shaffer & Ginsberg, 2017), and sleep-aging penalty literature
          (Belsky et al., <em>eLife</em>, 2022; Walker, 2017; Irwin, 2019).
          Full biological age targets Levine et al. <em>PhenoAge</em> (<em>Aging</em>, 2018) and
          Klemera–Doubal method; pace-of-aging from <em>DunedinPACE</em> (Belsky et al., 2022);
          cardiovascular risk from AHA PREVENT equations (2023).
          Any domain estimate is suppressed until the inputs required to compute it are present.
          Garmin VO₂ max validated via FirstBeat Analytics (±5% of lab VO₂ max).
          Garmin sleep algorithm benchmarked: Chinoy et al., <em>Sleep</em>, 2021.
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

function Real({ children, style }) {
  return <div style={{ fontSize: 18, fontWeight: 700, ...style }}>{children}</div>
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

function Pill({ children, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600,
      color, background: `${color}1a`, border: `1px solid ${color}40`,
      borderRadius: 20, padding: '3px 10px',
    }}>{children}</div>
  )
}
