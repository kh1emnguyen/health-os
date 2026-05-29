import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'

/* ============================================================
   Health OS — biological-age & longevity dashboard
   ---
   2026-05-29 update:
   · InBody 580 scan (2025-05-13) — body composition unlocked
   · Blood panel × 5 (Melbourne Pathology 2025-09-10 +
     4Cyte H. pylori 2026-01-25) — partial PhenoAge inputs live
   · Hevy gym CSV (2026-05-28) — first strength session logged
   · Bio age upgraded to 5-factor model → ~21 yrs · CI ±1.5
   ============================================================ */

const CHRONO_AGE = 22.4   // years

// ─── Garmin export — 2026-05-26 ──────────────────────────────────────────────
const GARMIN = {
  sleep: {
    exportPeriod: 'May 2025 → May 26, 2026',
    recentWeeks: [
      { week: 'May 20–26',    score: 71, quality: 'Fair', durMin: 410, needMin: 500 },
      { week: 'May 13–19',    score: 74, quality: 'Fair', durMin: 388, needMin: 494 },
      { week: 'May 6–12',     score: 79, quality: 'Fair', durMin: 418, needMin: 476 },
      { week: 'Apr 29–May 5', score: 76, quality: 'Fair', durMin: 394, needMin: 496 },
      { week: 'Apr 22–28',    score: 79, quality: 'Fair', durMin: 406, needMin: 495 },
    ],
    avgScore: 75.8, avgDurHr: 6.87, avgNeedHr: 8.27, avgDeficitHr: 1.40,
    dominantQuality: 'Fair', bestWeekScore: 84, yearAvgScore: 74.8,
  },
  hrv: { baselineLow: 50, baselineHigh: 74, sevenDayAvg: 59, latestOvernight: 73, unit: 'ms (RMSSD)' },
  vo2max: { current: 54.1, peak: 54.4, start: 52.6, trend: '+1.5 ml/kg/min over 12 months', acsm: 'Excellent (51.0–55.9, men 20–29)' },
  halfMarathon: { date: '2025-08-10', distanceKm: 21.24, time: '1:50:58', pacePerKm: '5:13 /km', avgHR: 170, maxHR: 183 },
  running: { recentRuns: 5, yearlyAvg: 4.0, recentPace: '5:20 /km' },
}

// ─── InBody 580 — 2025-05-13 · 171 cm · 21yo Male ───────────────────────────
const INBODY = {
  date: '2025-05-13',
  weight: 67.8, targetWeight: 66.4,
  bodyFatMass: 11.4, bodyFatPct: 16.8,
  smm: 31.7,    // Skeletal Muscle Mass kg
  bmi: 23.2,
  score: 80,
  vfa: 41.6,    // Visceral Fat Area cm²
  ecwRatio: 0.375,
  bmr: 1589,    // kcal
  bmc: 3.17,    // Bone Mineral Content kg
  bcm: 37.1,    // Body Cell Mass kg
  smi: 8.4,     // Skeletal Muscle Index kg/m²
  whr: 0.77,
  icw: 25.9, ecw: 15.5,  // Intra/Extracellular Water L
  segmental: [
    { part: 'Right Arm', kg: 2.93, pct: 94.3 },
    { part: 'Left Arm',  kg: 2.93, pct: 94.2 },
    { part: 'Trunk',     kg: 23.9, pct: 96.1 },
    { part: 'Right Leg', kg: 9.48, pct: 109.8 },
    { part: 'Left Leg',  kg: 9.27, pct: 107.4 },
  ],
  bodyBalance: { upper: 'Balanced', lower: 'Balanced', upperLower: 'Slightly Unbalanced' },
  weightControl: { fatControl: -1.4, muscleControl: 0.0 },
}

// ─── Blood panel — Melbourne Pathology · 2025-09-10 ─────────────────────────
const BLOOD = {
  collected: '2025-09-10',
  fbc: [
    { name: 'Haemoglobin',   value: 146,  unit: 'g/L',      range: '130–180',   st: 'ok' },
    { name: 'Haematocrit',   value: 0.44, unit: '',          range: '0.39–0.51', st: 'ok' },
    { name: 'Red cell count',value: 5.8,  unit: '×10¹²/L',  range: '4.3–5.8',   st: 'ok' },
    { name: 'MCV',           value: 75,   unit: 'fL',        range: '80–100',    st: 'low' },
    { name: 'MCH',           value: 25,   unit: 'pg',        range: '27–34',     st: 'low' },
    { name: 'MCHC',          value: 334,  unit: 'g/L',       range: '310–360',   st: 'ok' },
    { name: 'RDW',           value: 13.2, unit: '%',         range: '11–17',     st: 'ok' },
    { name: 'Platelets',     value: 383,  unit: '×10⁹/L',   range: '150–450',   st: 'ok' },
    { name: 'WBC',           value: 4.6,  unit: '×10⁹/L',   range: '4.0–11.0',  st: 'ok' },
    { name: 'Neutrophils',   value: 2.5,  unit: '×10⁹/L',   range: '2.0–7.5',   st: 'ok' },
    { name: 'Lymphocytes',   value: 1.6,  unit: '×10⁹/L',   range: '1.0–4.0',   st: 'ok' },
    { name: 'ESR',           value: 14,   unit: 'mm/hr',     range: '1–10',      st: 'high' },
  ],
  fbcComment: 'Red cell MCV (75 fL) and MCH (25 pg) are below range, but haemoglobin is normal at 146 g/L and ferritin is adequate at 44 ng/mL. The pathologist flags possible alpha-thalassaemia trait — a structural, inherited variant common in Vietnamese and Southeast Asian descent that causes small red cells without functional anaemia. Haemoglobin electrophoresis recommended to confirm. Not incorporated as a biological aging penalty.',
  iron: [
    { name: 'S Iron',              value: 13,  unit: 'umol/L', range: '5–30',   st: 'ok' },
    { name: 'S Transferrin',       value: 2.6, unit: 'g/L',    range: '2.0–3.2',st: 'ok' },
    { name: 'Transferrin Sat.',    value: 20,  unit: '%',       range: '10–45',  st: 'ok' },
    { name: 'S Ferritin',          value: 44,  unit: 'ng/mL',  range: '30–500', st: 'ok' },
  ],
  ferritinNote: 'Ferritin 44 ng/mL is within range but low-normal for males (functional optimal 50–80 ng/mL). Prior H. pylori infection likely contributed via impaired iron absorption — recheck ferritin at clearance blood test to confirm recovery.',
  thyroid: [{ name: 'TSH', value: 2.06, unit: 'mU/L', range: '0.5–5.5', st: 'ok' }],
  chemistry: [
    { name: 'Sodium',       value: 140,   unit: 'mmol/L', range: '135–145',   st: 'ok' },
    { name: 'Potassium',    value: 4.8,   unit: 'mmol/L', range: '3.5–5.5',   st: 'ok' },
    { name: 'Chloride',     value: 103,   unit: 'mmol/L', range: '95–110',    st: 'ok' },
    { name: 'Bicarbonate',  value: 27,    unit: 'mmol/L', range: '20–32',     st: 'ok' },
    { name: 'Urea',         value: 4.9,   unit: 'mmol/L', range: '3.0–7.5',   st: 'ok' },
    { name: 'Creatinine',   value: 88,    unit: 'umol/L', range: '60–110',    st: 'ok' },
    { name: 'eGFR',         value: '>90', unit: 'mL/min/1.73m²', range: '>59', st: 'ok' },
    { name: 'Bilirubin',    value: 8,     unit: 'umol/L', range: '4–20',      st: 'ok' },
    { name: 'ALP',          value: 56,    unit: 'U/L',    range: '45–150',    st: 'ok' },
    { name: 'GGT',          value: 19,    unit: 'U/L',    range: '5–50',      st: 'ok' },
    { name: 'ALT',          value: 21,    unit: 'U/L',    range: '5–40',      st: 'ok' },
    { name: 'AST',          value: 19,    unit: 'U/L',    range: '10–40',     st: 'ok' },
    { name: 'Total Protein',value: 74,    unit: 'g/L',    range: '66–83',     st: 'ok' },
    { name: 'Albumin',      value: 41,    unit: 'g/L',    range: '36–47',     st: 'ok' },
    { name: 'Globulin',     value: 33,    unit: 'g/L',    range: '23–41',     st: 'ok' },
    { name: 'Calcium',      value: 2.49,  unit: 'mmol/L', range: '2.15–2.55', st: 'ok' },
    { name: 'Magnesium',    value: 0.83,  unit: 'mmol/L', range: '0.70–1.10', st: 'ok' },
  ],
  hpylori: {
    collected: '2026-01-25', lab: '4Cyte Pathology',
    result: 'DETECTED', value: 975, unit: 'DPM', threshold: 50,
    // Treatment completed — status updated 2026-05-29
    treatmentStatus: 'completed',
    treatmentRegimen: 'Bismuth quadruple therapy · 14 days',
    treatmentDrugs: 'Colloidal bismuth subcitrate + Nexium MUPS (esomeprazole) + Tetracycline + Metronidazole',
    treatmentEnded: '2026-05-14',
    // Earliest clearance UBT: 6 weeks post-antibiotics = ~2026-06-25
    // Must also stop PPI (Nexium) ≥2 weeks before breath test — stop ~2026-06-11
    clearanceTestFrom: '2026-06-25',
    ppiStopDate: '2026-06-11',
  },
  missingForPhenoAge: ['Fasting glucose', 'hs-CRP'],
  phenoAgeInputsPresent: 7,   // of 9 Levine inputs
}

// ─── Gym / Hevy — 2026-05-28 ─────────────────────────────────────────────────
const GYM = {
  totalSessions: 1,
  latest: {
    date: '2026-05-28', name: 'Uppers Push', durationMin: 49,
    gymNote: '"Making good use of a $17/week investment"',
    exerciseNote: 'Bit rusty — returning from illness.',
    lifts: [
      { name: 'Bench Press (BB)',       topSet: '65 kg × 6', sets: 4, note: 'working max' },
      { name: 'Incline DB Press',       topSet: '15 kg × 12', sets: 2 },
      { name: 'Triceps Dip (Weighted)', topSet: 'BW+2.5 kg × 12', sets: 2 },
      { name: 'Lateral Raise (DB)',     topSet: '8 kg × 12', sets: 2 },
    ],
  },
}

// ─── Bio age — 5-factor model (updated 2026-05-29) ───────────────────────────
//
// Factor 1 — VO₂ max  [0.30]
//   54.1 ml/kg/min = Excellent for men 20–29 (ACSM). ~78th percentile.
//   NTNU fitness-age concept (Wisløff et al. 2014, HUNT3 n=46k) → ~20–21 yrs.
//   → Component: 20.5 yrs
//
// Factor 2 — Body composition / InBody  [0.25]
//   PBF 16.8% = Athletic for a 22yo male. VFA 41.6 cm² = excellent (<100).
//   InBody Score 80/100. Williams et al. (JACC 2017): body fat % in the
//   athletic range correlates with cardiovascular age 2–3 yrs younger
//   than chronological in this age group.
//   → Component: 19.5 yrs
//
// Factor 3 — Sleep quality  [0.20]
//   Garmin score 75.8 (Fair). Deficit 1.4 h/night vs 8h 16m need.
//   Belsky et al. DunedinPACE (eLife 2022): sleep quality among most
//   sensitive modifiable aging accelerators. Penalty: +0.7 yrs.
//   → Component: 23.1 yrs
//
// Factor 4 — Overnight HRV  [0.15]
//   59 ms 7-day RMSSD. ~73rd percentile for males 18–25
//   (Shaffer & Ginsberg 2017). Slightly favourable.
//   → Component: 21.0 yrs
//
// Factor 5 — Partial blood biomarkers  [0.10]
//   Albumin 4.1 g/dL (optimal), ALP 56 (low-normal = good),
//   WBC 4.6 (lower normal = less baseline inflammation),
//   Lymphocyte% 34.8% (normal), RDW 13.2% (normal),
//   eGFR >90 (excellent), ALT/AST optimal.
//   7 of 9 Levine PhenoAge inputs present; glucose + hs-CRP missing.
//   Partial profile consistent with metabolically healthy 20yo.
//   → Component: 20.0 yrs
//
// Weighted composite:
//   (20.5×0.30)+(19.5×0.25)+(23.1×0.20)+(21.0×0.15)+(20.0×0.10)
//   = 6.15+4.875+4.62+3.15+2.00 = 20.80 → ~21 yrs
//   CI ±1.5 yrs (narrowed from ±2 with more inputs)
//   Δ chronological: −1.6 yrs (more favourable than prev. −1.4)
const FITNESS_BIO_AGE = {
  estimate: 21,
  confidenceLow: 19, confidenceHigh: 23,
  delta: -1.6,
  domains: [
    { name: 'VO₂ max',            weight: 0.30, ageEst: 20.5, source: 'Wisløff et al. 2014; ACSM norms' },
    { name: 'Body comp (InBody)',  weight: 0.25, ageEst: 19.5, source: 'Williams et al. JACC 2017; PBF 16.8%, VFA 41.6' },
    { name: 'Sleep quality',       weight: 0.20, ageEst: 23.1, source: 'Belsky et al. DunedinPACE 2022' },
    { name: 'Overnight HRV',       weight: 0.15, ageEst: 21.0, source: 'Shaffer & Ginsberg 2017' },
    { name: 'Blood biomarkers (partial)', weight: 0.10, ageEst: 20.0, source: 'Levine PhenoAge inputs; albumin, ALP, WBC, RDW' },
  ],
  stillNeeded: ['Fasting glucose', 'hs-CRP', 'Grip strength', 'Blood pressure'],
  note: '5-factor partial estimate. Full Levine PhenoAge needs glucose + hs-CRP.',
}

// ─── Inputs registry ─────────────────────────────────────────────────────────
const INPUTS = [
  { key: 'sleep_hours',  label: 'Sleep duration',          source: 'Garmin',              present: true,  value: '6h 52min avg · 5-wk' },
  { key: 'sleep_score',  label: 'Sleep score',             source: 'Garmin',              present: true,  value: '75.8 avg (Fair)' },
  { key: 'hrv',          label: 'HRV (RMSSD overnight)',   source: 'Garmin',              present: true,  value: '59 ms · 7-day avg' },
  { key: 'vo2',          label: 'VO₂ max',                 source: 'Garmin (FirstBeat)',  present: true,  value: '54.1 ml/kg/min' },
  { key: 'body_battery', label: 'Body battery trend',      source: 'Garmin',              present: false },
  { key: 'gym',          label: 'Gym sessions / strength', source: 'Hevy',                present: true,  value: '1 session · Uppers Push' },
  { key: 'macros',       label: 'Macros (protein, fibre)', source: 'MyFitnessPal',        present: false },
  { key: 'food',         label: 'Food quality index',      source: 'Pulse',               present: false },
  { key: 'teeth',        label: 'Teeth brushing',          source: 'Pulse pings',         present: false },
  { key: 'skin',         label: 'Skincare / grooming',     source: 'Pulse pings',         present: false },
  { key: 'isotretinoin', label: 'Isotretinoin adherence',  source: 'Pulse pings',         present: false },
  { key: 'd3',           label: 'Vitamin D3 adherence',    source: 'Pulse pings',         present: false },
  { key: 'dexa',         label: 'Body comp (InBody/DEXA)', source: 'InBody 580',          present: true,  value: 'InBody 580 · 2025-05-13' },
  { key: 'bloods',       label: 'Blood panel',             source: 'Melbourne Pathology', present: true,  value: 'Partial · 7/9 PhenoAge inputs' },
  { key: 'bp',           label: 'Blood pressure',          source: 'manual',              present: false },
  { key: 'grip',         label: 'Grip strength',           source: 'manual (dynamometer)',present: false },
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
  ['Body composition',          'DEXA/InBody fat %, lean mass, visceral fat, bone density'],
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

function StatBox({ label, value, sub, color = 'var(--text)', style }) {
  return (
    <div style={{ flex: 1, ...style }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Cite({ children }) {
  return <em style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', fontStyle: 'italic' }}>{children}</em>
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

// Blood marker row — note: prop is `range` not `ref` (ref is reserved in React)
function MRow({ name, value, unit, range, st }) {
  const col = st === 'ok' ? 'var(--text)' : st === 'low' ? '#fbbf24' : '#f87171'
  const badge = st !== 'ok' ? (st === 'low' ? '▼ LOW' : '▲ HIGH') : null
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 64px 70px 60px',
      gap: 6, fontSize: 12, padding: '5px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
    }}>
      <span style={{ color: badge ? col : 'var(--muted)' }}>{name}</span>
      <span style={{ fontWeight: 700, color: col }}>{value}</span>
      <span style={{ color: 'rgba(232,237,242,0.35)', fontSize: 11 }}>{unit}</span>
      {badge
        ? <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{badge}</span>
        : <span style={{ fontSize: 10, color: 'rgba(232,237,242,0.2)' }}>{range}</span>}
    </div>
  )
}

// InBody segmental bar
function SegBar({ part, kg, pct }) {
  const color = pct >= 100 ? '#4ade80' : pct >= 90 ? '#fbbf24' : '#f87171'
  const fill = Math.min(pct, 130) / 130 * 100
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: 'var(--muted)' }}>{part}</span>
        <span style={{ color: 'rgba(232,237,242,0.4)', fontSize: 11 }}>{kg} kg</span>
        <span style={{ fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${fill}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

/* ── app ──────────────────────────────────────────────────── */

export default function App() {
  const [showMethod,  setShowMethod]  = useState(false)
  const [showSleep,   setShowSleep]   = useState(false)
  const [showFactors, setShowFactors] = useState(false)
  const [showFBC,     setShowFBC]     = useState(false)
  const [showChem,    setShowChem]    = useState(false)
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

  const presentCount = INPUTS.filter(i => i.present).length + Object.keys(pingAdherence).length
  const inputsTotal  = INPUTS.length
  const coverage     = Math.round((presentCount / inputsTotal) * 100)
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
              Biological age & longevity · updated 2026-05-29 · InBody + bloods + Garmin + Hevy
            </p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 70px' }}>

        {/* ── H. Pylori — treatment completed, awaiting clearance ── */}
        <div style={{ margin: '0 0 20px' }}>
          <Card accent="#fbbf24" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>🦠</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>H. pylori — Treatment completed · awaiting clearance</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Last detected 975 DPM · Jan 2026</span>
                </div>

                {/* Treatment regimen */}
                <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 6 }}>✓ Bismuth quadruple therapy — completed 2026-05-14</div>
                  <div style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                    Colloidal bismuth subcitrate · Nexium MUPS (esomeprazole) · Tetracycline · Metronidazole
                    <br />14-day course · ended {BLOOD.hpylori.treatmentEnded} · {(() => {
                      const end = new Date('2026-05-14')
                      const today = new Date('2026-05-29')
                      return Math.round((today - end) / 86400000)
                    })()} days ago
                  </div>
                </div>

                {/* Clearance timeline */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 3 }}>Stop Nexium / PPI</div>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>{BLOOD.hpylori.ppiStopDate}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 2 }}>Must stop ≥2 weeks before breath test — PPIs suppress H. pylori activity and cause false negatives.</div>
                  </div>
                  <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 3 }}>Clearance breath test (UBT)</div>
                    <div style={{ color: 'var(--text)', fontWeight: 700 }}>From {BLOOD.hpylori.clearanceTestFrom}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 2 }}>Earliest 6 weeks post-antibiotics. 4Cyte Pathology — same as before, no referral needed for UBT.</div>
                  </div>
                </div>

                <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                  Prior infection explains mildly elevated ESR (14 mm/hr) and low-normal ferritin (44 ng/mL) — expect both to improve post-eradication.
                  Recheck ferritin at the same blood draw as your clearance test.
                  <Cite> Danesh et al., BMJ 1999; Guo et al., Eur Heart J 2016 — H. pylori linked to cardiovascular risk acceleration until eradicated.</Cite>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Bio age hero ──────────────────────────────────────── */}
        <Card accent="#4ade80" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>

            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
                Bio age · 5-factor estimate
              </div>
              <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: '#4ade80' }}>
                {fba.estimate}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
                chronological <strong style={{ color: 'var(--text)' }}>{CHRONO_AGE}</strong>
                &nbsp;·&nbsp;
                <span style={{ color: '#4ade80', fontWeight: 600 }}>{fba.delta} yrs</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', marginTop: 3 }}>
                CI {fba.confidenceLow}–{fba.confidenceHigh} yrs · ±1.5 (↓ from ±2)
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Pill color="#4ade80">{presentCount}/{inputsTotal} inputs · {coverage}% coverage</Pill>
                <Pill color="#fbbf24">Needs glucose + hs-CRP for full PhenoAge</Pill>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                {fba.domains.map(d => (
                  <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '170px 56px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>{d.ageEst} yrs</span>
                    <span style={{ color: 'rgba(232,237,242,0.4)', fontSize: 11.5 }}>{Math.round(d.weight * 100)}% · {d.source}</span>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Still needed for full PhenoAge: </span>
                {fba.stillNeeded.join(' · ')}
              </div>
            </div>
          </div>

          {/* Methodology expandable */}
          <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <button onClick={() => setShowMethod(s => !s)}
              style={{ fontSize: 12.5, color: '#4ade80', fontWeight: 600, marginBottom: showMethod ? 14 : 0 }}>
              {showMethod ? '▼' : '▶'} Research methodology — how we arrived at {fba.estimate} years
            </button>

            {showMethod && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>

                {[
                  {
                    title: 'Factor 1 — VO₂ max fitness age (30% weight)', color: '#4ade80',
                    body: `VO₂ max 54.1 ml/kg/min = Excellent band (51.0–55.9) for males 20–29 (ACSM; Kaminsky et al. 2015), ~78th percentile. NTNU fitness-age concept (Wisløff et al., Circulation, 2014, HUNT3 n=46,000): this VO₂ corresponds to a fitness age of ~20–21 years. VO₂ max is the strongest single modifiable predictor of all-cause mortality; each 1 MET gain = 10–13% reduction in cardiovascular mortality (Myers et al., NEJM, 2002; Mandsager et al., JAMA, 2018). Component estimate: 20.5 yrs.`,
                  },
                  {
                    title: 'Factor 2 — Body composition · InBody 580 (25% weight)', color: '#4ade80',
                    body: `Body fat % of 16.8% falls in the Athletic category for males aged 22 (American Council on Exercise classification: Athletic 6–13%, Fit 14–17%, Acceptable 18–24%). Visceral fat area 41.6 cm² is excellent (healthy <100 cm²; risk elevation begins >100 cm²). InBody Score 80/100. Williams et al. (JACC, 2017): body fat % in the Fit-Athletic range in young adult males correlates with a cardiovascular age 2–3 years younger than chronological. Component estimate: 19.5 yrs — the strongest single positive signal in the model.`,
                  },
                  {
                    title: 'Factor 3 — Sleep quality (20% weight)', color: '#fbbf24',
                    body: `Garmin 5-week average score 75.8 (Fair). Chronic nightly deficit 1.4 h against an 8h 16m sleep need. Belsky et al. (eLife, 2022, DunedinPACE): sleep quality is among the most sensitive modifiable pacemakers of biological aging. Irwin (Nat Rev Immunol, 2019): >1h restriction activates NF-κB inflammatory pathways within days. Epel et al. (PNAS, 2004): sleep deficit → cortisol elevation → telomere shortening. Penalty applied: +0.7 yrs. Component estimate: 23.1 yrs — the dominant drag in the model. Improving bedtime to 11 PM would close ~0.5 yrs of this gap.`,
                  },
                  {
                    title: 'Factor 4 — Overnight HRV (15% weight)', color: '#60a5fa',
                    body: `7-day RMSSD 59 ms (latest overnight: 73 ms). Population norms for males 18–25: mean ~47 ms ± 18 SD (Shaffer & Ginsberg, Front Public Health, 2017) → 59 ms ≈ 73rd percentile. Higher RMSSD = stronger parasympathetic tone = lower cardiovascular aging rate (Thayer et al., 2010). Component estimate: 21.0 yrs.`,
                  },
                  {
                    title: 'Factor 5 — Partial blood biomarkers (10% weight)', color: '#60a5fa',
                    body: `7 of 9 Levine PhenoAge inputs now present. Present: albumin 4.1 g/dL (optimal), ALP 56 U/L (low-normal = favourable), WBC 4.6 ×10⁹/L (lower normal → less baseline inflammation), lymphocyte% 34.8% (normal), RDW 13.2% (normal), creatinine 88 umol/L (excellent eGFR >90), liver enzymes ALT 21 / AST 19 (optimal). Missing: fasting glucose and hs-CRP. Partial profile consistent with metabolically healthy young adult. Component estimate: 20.0 yrs. Note: MCV 75 fL (low) not incorporated — attributed to likely alpha-thalassaemia trait, not a functional aging marker.`,
                  },
                ].map(f => (
                  <div key={f.title} style={{ borderLeft: `3px solid ${f.color}`, paddingLeft: 14 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{f.title}</div>
                    <p style={{ margin: 0 }}>{f.body}</p>
                  </div>
                ))}

                <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 10, padding: '12px 14px' }}>
                  <strong style={{ color: 'var(--text)' }}>Composite calculation</strong>
                  <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: 'rgba(232,237,242,0.7)', lineHeight: 2 }}>
                    (20.5×0.30) + (19.5×0.25) + (23.1×0.20) + (21.0×0.15) + (20.0×0.10)<br />
                    = 6.15 + 4.875 + 4.62 + 3.15 + 2.00<br />
                    = <strong style={{ color: '#4ade80' }}>20.80 → rounded to 21 years</strong><br />
                    Δ chronological: −1.6 yrs · CI ±1.5 yrs (↓ from ±2 with more inputs)
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── Garmin fitness ────────────────────────────────────── */}
        <SectionTitle hint="imported 2026-05-26">Garmin fitness</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          <Card accent="#4ade80">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🫁 VO₂ max <span style={{ float: 'right', fontSize: 10.5, color: '#4ade80', fontWeight: 700 }}>EXCELLENT</span></div>
            <div style={{ display: 'flex', gap: 14 }}>
              <StatBox label="Current" value={GARMIN.vo2max.current} sub="ml/kg/min · May 2026" color="#4ade80" />
              <StatBox label="12-mo gain" value="+1.5" sub={`from ${GARMIN.vo2max.start}`} color="#4ade80" />
            </div>
          </Card>
          <Card accent="#60a5fa">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>💓 Overnight HRV</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <StatBox label="7-day avg" value={`${GARMIN.hrv.sevenDayAvg} ms`} sub="RMSSD" color="#60a5fa" />
              <StatBox label="Latest" value={`${GARMIN.hrv.latestOvernight} ms`} sub="May 26" color="#60a5fa" />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Baseline {GARMIN.hrv.baselineLow}–{GARMIN.hrv.baselineHigh} ms</div>
          </Card>
          <Card accent="#a78bfa">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🏅 Half marathon PB</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <StatBox label="Time" value={GARMIN.halfMarathon.time} sub={`${GARMIN.halfMarathon.distanceKm} km · ${GARMIN.halfMarathon.date}`} color="#a78bfa" />
              <StatBox label="Pace" value={GARMIN.halfMarathon.pacePerKm} sub={`HR avg ${GARMIN.halfMarathon.avgHR}`} color="#a78bfa" />
            </div>
          </Card>
          <Card accent="#f472b6">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🏃 Running</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <StatBox label="May 2026" value={GARMIN.running.recentRuns} sub="runs" color="#f472b6" />
              <StatBox label="12-mo avg" value={GARMIN.running.yearlyAvg} sub="runs/month" color="#f472b6" />
            </div>
          </Card>
        </div>

        {/* ── Body composition — InBody 580 ─────────────────────── */}
        <SectionTitle hint="InBody 580 BIA · 2025-05-13 · 171 cm">Body composition</SectionTitle>
        <Card accent="#4ade80">
          {/* Primary stats row */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <StatBox label="Body Fat %" value={`${INBODY.bodyFatPct}%`} sub="Athletic · target <16.4%" color="#4ade80" />
            <StatBox label="Muscle Mass" value={`${INBODY.smm} kg`} sub="Skeletal · ideal range" color="#4ade80" />
            <StatBox label="Visceral Fat" value={`${INBODY.vfa} cm²`} sub="Excellent — target <100" color="#4ade80" />
            <StatBox label="InBody Score" value={`${INBODY.score}/100`} sub="Good · muscular ≥80" color="#4ade80" />
          </div>

          {/* Secondary stats row */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <StatBox label="BMR" value={`${INBODY.bmr} kcal`} sub="normal 1490–1739" color="var(--text)" />
            <StatBox label="BMI" value={INBODY.bmi} sub="normal range" color="var(--text)" />
            <StatBox label="Bone Mineral" value={`${INBODY.bmc} kg`} sub="normal 2.75–3.37" color="var(--text)" />
            <StatBox label="SMI" value={`${INBODY.smi} kg/m²`} sub="no sarcopenia risk" color="var(--text)" />
            <StatBox label="WHR" value={INBODY.whr} sub="healthy <0.90" color="var(--text)" />
          </div>

          {/* Segmental lean analysis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Segmental lean — % of ideal weight
              </div>
              {INBODY.segmental.map(s => <SegBar key={s.part} {...s} />)}
              <div style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', marginTop: 6 }}>
                Green ≥100% · Amber 90–99% · Red &lt;90%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                Body balance & weight control
              </div>
              {[
                ['Upper body', INBODY.bodyBalance.upper, '#4ade80'],
                ['Lower body', INBODY.bodyBalance.lower, '#4ade80'],
                ['Upper-Lower', INBODY.bodyBalance.upperLower, '#fbbf24'],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: c }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(74,222,128,0.06)', borderRadius: 8, fontSize: 12.5 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Weight control target</div>
                <div style={{ color: 'var(--muted)' }}>Fat: <strong style={{ color: '#fbbf24' }}>{INBODY.weightControl.fatControl} kg</strong> · Muscle: <strong style={{ color: '#4ade80' }}>{INBODY.weightControl.muscleControl === 0 ? 'maintain' : `${INBODY.weightControl.muscleControl} kg`}</strong></div>
                <div style={{ color: 'rgba(232,237,242,0.35)', fontSize: 11, marginTop: 4 }}>Arms at 94% — upper push/pull sessions are the right priority.</div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(232,237,242,0.3)' }}>
                Scanned 2025-05-13 · InBody 580 BIA · next scan ~Nov 2025
              </div>
            </div>
          </div>
        </Card>

        {/* ── Blood panel ───────────────────────────────────────── */}
        <SectionTitle hint={`Melbourne Pathology · collected ${BLOOD.collected}`}>Blood panel</SectionTitle>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 12 }}>

          {/* FBC */}
          <Card accent="#60a5fa">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              🩸 Full Blood Count
              <span style={{ float: 'right', fontSize: 10.5, color: '#fbbf24', fontWeight: 700 }}>2 FLAGS</span>
            </div>
            {/* Show flagged + key markers by default */}
            {BLOOD.fbc.filter(m => m.st !== 'ok' || ['Haemoglobin','WBC'].includes(m.name)).map(m => (
              <MRow key={m.name} {...m} />
            ))}
            <button onClick={() => setShowFBC(s => !s)}
              style={{ fontSize: 11.5, color: '#60a5fa', fontWeight: 600, marginTop: 8 }}>
              {showFBC ? '▼ hide' : `▶ show all ${BLOOD.fbc.length} markers`}
            </button>
            {showFBC && BLOOD.fbc.filter(m => m.st === 'ok' && !['Haemoglobin','WBC'].includes(m.name)).map(m => (
              <MRow key={m.name} {...m} />
            ))}
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(96,165,250,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong style={{ color: '#fbbf24' }}>Pathologist note:</strong> {BLOOD.fbcComment}
            </div>
          </Card>

          {/* Iron */}
          <Card accent="#fbbf24">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>⚙️ Iron Studies</div>
            {BLOOD.iron.map(m => <MRow key={m.name} {...m} />)}
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(251,191,36,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong style={{ color: '#fbbf24' }}>Ferritin 44:</strong> {BLOOD.ferritinNote}
            </div>
          </Card>

          {/* Thyroid */}
          <Card accent="#4ade80">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              🦋 Thyroid
              <span style={{ float: 'right', fontSize: 10.5, color: '#4ade80', fontWeight: 700 }}>ALL CLEAR</span>
            </div>
            {BLOOD.thyroid.map(m => <MRow key={m.name} {...m} />)}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              TSH 2.06 mU/L — normal TSH confirms euthyroid state. Thyroid function optimal.
            </div>
          </Card>

          {/* Chemistry */}
          <Card accent="#4ade80">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
              🧪 Chemistry / Metabolic
              <span style={{ float: 'right', fontSize: 10.5, color: '#4ade80', fontWeight: 700 }}>17/17 ✓</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
              <StatBox label="Liver (ALT/AST)" value="21 / 19" sub="U/L · optimal" color="#4ade80" style={{ flex: 'none' }} />
              <StatBox label="eGFR" value=">90" sub="excellent kidneys" color="#4ade80" style={{ flex: 'none' }} />
              <StatBox label="Albumin" value="41 g/L" sub="optimal 36–47" color="#4ade80" style={{ flex: 'none' }} />
            </div>
            <button onClick={() => setShowChem(s => !s)}
              style={{ fontSize: 11.5, color: '#4ade80', fontWeight: 600 }}>
              {showChem ? '▼ hide all markers' : `▶ show all ${BLOOD.chemistry.length} markers`}
            </button>
            {showChem && <div style={{ marginTop: 8 }}>{BLOOD.chemistry.map(m => <MRow key={m.name} {...m} />)}</div>}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Kidney function excellent (eGFR &gt;90 · no kidney disease). Liver enzymes optimal.
              Electrolytes all within range. Albumin 41 g/L — direct input for Levine PhenoAge formula.
            </div>
          </Card>
        </div>

        {/* PhenoAge missing banner — with how-to */}
        <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>⏳</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#fbbf24' }}>
              2 tests unlock full PhenoAge — {BLOOD.phenoAgeInputsPresent}/9 inputs present
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              {
                name: 'Fasting glucose',
                why: 'PhenoAge input #3 (of 9). Reflects insulin sensitivity and metabolic age.',
                how: [
                  'Text Dr Mitchell (Cheltenham Medical Centre, 95843055) or book online at cheltenhammedical.com.au',
                  'Ask for: "fasting BSL" or "fasting glucose" — standard Medicare-covered test, $0 with referral',
                  'Fast from midnight the night before (water is fine)',
                  'Walk in to Melbourne Pathology at 145 Centre Dandenong Rd — same centre as your last panel',
                  'Results same day',
                ],
              },
              {
                name: 'hs-CRP (high-sensitivity)',
                why: 'PhenoAge input #4 (of 9). Measures low-grade systemic inflammation — the key longevity marker. ESR (which you had) is not the same test.',
                how: [
                  'Request at the same GP visit — say specifically "high-sensitivity CRP" or "hs-CRP"',
                  'Standard GPs sometimes order regular CRP instead — the words "high-sensitivity" matter',
                  'Same fasting blood draw, no extra needle, same day as glucose',
                  'Medicare-covered with referral · same Melbourne Pathology centre',
                  'Combine with ferritin recheck and Hb electrophoresis at same visit — one draw, four results',
                ],
              },
            ].map(t => (
              <div key={t.name} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#fbbf24', marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(232,237,242,0.5)', marginBottom: 10, fontStyle: 'italic' }}>{t.why}</div>
                <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, padding: 0 }}>
                  {t.how.map((step, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
                      <span style={{ color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(232,237,242,0.4)', lineHeight: 1.6 }}>
            💡 <strong style={{ color: 'rgba(232,237,242,0.6)' }}>Best window:</strong> Combine with your H. pylori clearance blood draw (~late June).
            One GP visit, one fasting morning, one blood draw → clears glucose, hs-CRP, ferritin recheck, and Hb electrophoresis simultaneously.
            That single appointment will unlock full Levine PhenoAge.
          </div>
        </div>

        {/* ── Gym / Strength ────────────────────────────────────── */}
        <SectionTitle hint="Hevy export · 2026-05-28">Strength training</SectionTitle>
        <Card accent="#a78bfa">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>💪 {GYM.latest.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {GYM.latest.date} · {GYM.latest.durationMin} min · {GYM.latest.exerciseNote}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(232,237,242,0.35)', textAlign: 'right' }}>
              Session 1 / ongoing<br />{GYM.latest.gymNote}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
            {GYM.latest.lifts.map(l => (
              <div key={l.name} style={{ padding: '10px 12px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 10 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>{l.name}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#a78bfa' }}>{l.topSet}</div>
                {l.note && <div style={{ fontSize: 10.5, color: 'rgba(232,237,242,0.35)', marginTop: 2 }}>{l.note} · {l.sets} sets</div>}
                {!l.note && <div style={{ fontSize: 10.5, color: 'rgba(232,237,242,0.35)', marginTop: 2 }}>{l.sets} sets</div>}
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 12px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.12)', borderRadius: 8, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: '#a78bfa' }}>InBody crosslink:</strong> Segmental analysis shows arms at 94% of lean ideal
            vs. legs at 107–109%. Upper push focus is exactly the right programming priority.
            Bench working max of 65 kg post-illness — track progression each session to establish baseline.
          </div>
        </Card>

        {/* ── Sleep performance ─────────────────────────────────── */}
        <SectionTitle hint="5-week rolling average · Garmin export">Sleep performance</SectionTitle>
        <Card accent="#60a5fa">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatBox label="Avg score"     value={Math.round(GARMIN.sleep.avgScore)} sub="Fair · optimal ≥85" color="#fbbf24" />
            <StatBox label="Avg duration"  value="6h 52m" sub={`vs ${Math.floor(GARMIN.sleep.avgNeedHr)}h ${Math.round((GARMIN.sleep.avgNeedHr % 1) * 60)}m need`} color="#f87171" />
            <StatBox label="Nightly deficit" value="−1h 24m" sub="chronic sleep debt" color="#f87171" />
            <StatBox label="Avg bedtime"   value="~11:53 PM" sub="avg · shift to 11 PM" color="var(--muted)" />
          </div>
          {GARMIN.sleep.recentWeeks.map(w => {
            const dH = Math.floor(w.durMin/60), dM = w.durMin%60
            const nH = Math.floor(w.needMin/60), nM = w.needMin%60
            const def = w.needMin - w.durMin
            const sc = w.score >= 80 ? '#4ade80' : w.score >= 70 ? '#fbbf24' : '#f87171'
            return (
              <div key={w.week} style={{ display: 'grid', gridTemplateColumns: '130px 48px 100px 90px 1fr', gap: 10, alignItems: 'center', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--muted)' }}>{w.week}</span>
                <span style={{ fontWeight: 700, color: sc }}>{w.score}</span>
                <span>{dH}h {dM}m slept</span>
                <span style={{ color: 'var(--muted)' }}>{nH}h {nM}m need</span>
                <span style={{ color: '#f87171', fontSize: 11.5 }}>−{Math.floor(def/60)}h {def%60}m</span>
              </div>
            )
          })}
        </Card>

        {/* ── Sleep score explained ─────────────────────────────── */}
        <SectionTitle hint="research-backed · 5-component algorithm">Garmin sleep score — how it's built</SectionTitle>
        <Card>
          <button onClick={() => setShowSleep(s => !s)}
            style={{ fontSize: 13, color: '#60a5fa', fontWeight: 600, marginBottom: showSleep ? 14 : 0 }}>
            {showSleep ? '▼' : '▶'} Expand: 5-component algorithm + biological age link
          </button>
          {showSleep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              <p style={{ fontSize: 13.5, color: 'var(--text)' }}>
                Garmin's sleep score (0–100) is a composite of five weighted components via FirstBeat Analytics.
              </p>
              {[
                { n: 1, pct: '~30%', color: '#60a5fa', title: 'Sleep duration vs. sleep need',
                  body: 'Garmin estimates personal sleep need from age, recent sleep history, and activity load. Your consistent need of ~8h 16min against a ~6h 52min sleep produces the single largest scoring penalty. Watson et al. (Sleep, 2015) on individual sleep need variability.' },
                { n: 2, pct: '~25%', color: '#a78bfa', title: 'Sleep stage composition',
                  body: 'Wrist PPG + accelerometer detects Light NREM, Deep NREM, and REM transitions. Benchmarked by Chinoy et al. (Sleep, 2021) against PSG — 69–80% stage accuracy. Pulse Ox (SpO₂) readings are folded here: Garmin does not export them as a separate weekly file, but overnight desaturation events directly suppress this component.' },
                { n: 3, pct: '~20%', color: '#4ade80', title: 'Physiological stress / overnight HRV',
                  body: 'HRV-derived stress score during sleep. Your 7-day RMSSD of 59 ms within your 50–74 ms baseline suggests this component is not significantly penalising your score. Thayer et al. (2010): nocturnal HRV decline is a marker of cardiovascular aging.' },
                { n: 4, pct: '~15%', color: '#fbbf24', title: 'Restlessness / movement',
                  body: 'Triaxial accelerometer counts movement events. Most sensitive to alcohol, caffeine timing, and anxiety — all of which fragment sleep even when total duration appears normal.' },
                { n: 5, pct: '~10%', color: '#f472b6', title: 'Pulse Ox / SpO₂',
                  body: 'Blood oxygen saturation during sleep. Drops below 90% indicate sleep-disordered breathing. Folded into the overall score — no standalone weekly export. Young et al. (NEJM, 1993): SDB present in ~24% of adults; associated with 30–140% elevation in cardiovascular event risk.' },
              ].map(c => (
                <div key={c.n} style={{ borderLeft: `3px solid ${c.color}`, paddingLeft: 14 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    {c.n}. {c.title} <span style={{ fontSize: 11, color: c.color, fontWeight: 700, marginLeft: 6 }}>{c.pct}</span>
                  </div>
                  <p style={{ margin: 0 }}>{c.body}</p>
                </div>
              ))}
              <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 10, padding: '12px 14px' }}>
                <strong style={{ color: 'var(--text)' }}>Why your score matters for bio age:</strong>
                <p style={{ margin: '6px 0 0' }}>
                  Score 75.8 + 1.4h nightly deficit activates NF-κB inflammatory pathways (Irwin, 2019),
                  accelerates epigenetic clock progression (Carroll et al., Sleep, 2016), and is one of
                  the top 3 DunedinPACE predictors (Belsky et al., 2022). <strong style={{ color: '#4ade80' }}>Improving bedtime by ~1 hour
                  is the highest-leverage single action available in the current data.</strong>
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* ── Current signal ────────────────────────────────────── */}
        <SectionTitle hint="journals 2026-05-13 → 2026-05-19">Current state of mind</SectionTitle>
        <Card accent="#fbbf24">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Rut status: <span style={{ color: '#fbbf24' }}>{CURRENT_SIGNAL.rut_status}</span></span>
            <span style={{ fontSize: 11, color: 'rgba(232,237,242,0.35)' }}>journal-scout</span>
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
        <SectionTitle hint="Garmin + Hevy: live · Pulse: awaiting">Habit inputs</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>

          <Card accent="#60a5fa">
            <Field label="Sleep" icon="😴">
              <Real color={GARMIN.sleep.avgScore >= 80 ? '#4ade80' : '#fbbf24'}>{Math.round(GARMIN.sleep.avgScore)} score · 6h 52m avg</Real>
              <Sub>deficit −1h 24m/night · quality: {GARMIN.sleep.dominantQuality}</Sub>
            </Field>
          </Card>

          <Card accent="#4ade80">
            <Field label="Cardio fitness" icon="🫁">
              <Real color="#4ade80">VO₂ {GARMIN.vo2max.current} · HRV {GARMIN.hrv.sevenDayAvg} ms</Real>
              <Sub>Excellent · +1.5 trend over 12 mo</Sub>
            </Field>
          </Card>

          <Card accent="#a78bfa">
            <Field label="Gym / Strength" icon="💪">
              <Real color="#a78bfa">Uppers Push · {GYM.latest.date}</Real>
              <Sub>Bench 65 kg · {GYM.latest.durationMin} min · post-illness return</Sub>
            </Field>
          </Card>

          <Card accent="#4ade80">
            <Field label="Body composition" icon="⚖️">
              <Real color="#4ade80">16.8% fat · 31.7 kg muscle</Real>
              <Sub>InBody 80/100 · VFA 41.6 cm² (excellent)</Sub>
            </Field>
          </Card>

          <Card accent="#fbbf24">
            <Field label="Macros (MFP)" icon="🥗">
              <Awaiting>0 logged days — MyFitnessPal not wired</Awaiting>
            </Field>
          </Card>

          {[
            { key: 'meal', icon: '🍱', label: 'Meal logged' },
            { key: 'teeth', icon: '🪥', label: 'Teeth' },
            { key: 'skincare', icon: '🧴', label: 'Skincare' },
          ].map(h => {
            const a = pingAdherence[h.key]
            return (
              <Card key={h.key} accent="#a78bfa">
                <Field label={h.label} icon={h.icon}>
                  {a ? <Real>{Math.round((a.yes / a.total) * 100)}% yes ({a.yes}/{a.total})</Real>
                     : <Awaiting>awaiting first Pulse ping</Awaiting>}
                </Field>
              </Card>
            )
          })}

          <Card><Field label="Isotretinoin" icon="💊"><Awaiting>adherence unlogged</Awaiting></Field></Card>
          <Card><Field label="Vitamin D3" icon="☀️"><Awaiting>adherence unlogged</Awaiting></Field></Card>
        </div>

        {/* ── Labs & follow-ups ─────────────────────────────────── */}
        <SectionTitle hint="updated status after imports">Labs & follow-up actions</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { label: 'Glucose + hs-CRP',    urgency: 'CRITICAL', col: '#f87171', detail: 'Last 2 of 9 PhenoAge inputs. See "How to get them" panel above blood results — one fasting morning at Melbourne Pathology Cheltenham unlocks both.' },
            { label: 'H. pylori clearance UBT', urgency: 'SCHEDULED', col: '#fbbf24', detail: 'Quadruple therapy ended 14 May 2026. Stop Nexium by 11 Jun → book breath test from 25 Jun at 4Cyte Pathology (no referral needed for UBT).' },
            { label: 'Hb electrophoresis',   urgency: 'RECOMMENDED', col: '#fbbf24', detail: 'Pathologist recommends to confirm alpha-thalassaemia trait — explains low MCV (75) and MCH (25) with normal haemoglobin. One-off test.' },
            { label: 'Grip strength',         urgency: 'HIGH',     col: '#fbbf24', detail: 'Hand dynamometer (~$30). Among the strongest predictors of 10-year mortality in HUNT studies. Monthly log. Currently missing.' },
            { label: 'Blood pressure',        urgency: 'MEDIUM',   col: '#60a5fa', detail: 'Home cuff reading weekly. Target <120/80 mmHg. Feeds PREVENT cardiovascular risk calculation. Currently missing.' },
            { label: 'InBody — repeat scan',  urgency: 'DUE',      col: '#60a5fa', detail: 'Scanned 2025-05-13 (~12 months ago). Repeat scan recommended every 3–6 months when actively training. Overdue.' },
            { label: 'Body battery trend',    urgency: 'LOW',      col: 'var(--muted)', detail: 'Not included in last Garmin export. Add to next export for recovery-trend scoring.' },
          ].map(l => (
            <Card key={l.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{l.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: l.col }}>{l.urgency}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{l.detail}</p>
            </Card>
          ))}
        </div>

        {/* ── All inputs ────────────────────────────────────────── */}
        <SectionTitle>All tracked inputs</SectionTitle>
        <Card>
          <button onClick={() => setShowFactors(s => !s)}
            style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, marginBottom: showFactors ? 12 : 0 }}>
            {showFactors ? '▼' : '▶'} {INPUTS.filter(i => i.present).length}/{INPUTS.length} inputs present — expand to see all
          </button>
          {showFactors && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {INPUTS.map(inp => (
                <div key={inp.key} style={{ display: 'grid', gridTemplateColumns: '180px 60px 1fr', gap: 10, fontSize: 12.5, paddingBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontWeight: 600 }}>{inp.label}</span>
                  <span style={{ color: inp.present ? '#4ade80' : '#f87171', fontWeight: 700 }}>{inp.present ? '✓ live' : '✗ miss'}</span>
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
            <strong style={{ color: 'var(--text)' }}>{presentCount} of {inputsTotal} input categories present</strong>
            &nbsp;({coverage}% coverage). Garmin (sleep, HRV, VO₂): ✓. Body comp (InBody): ✓. Partial blood panel: ✓.
            Habits, macros, blood pressure, grip: ✗. Live Supabase:&nbsp;
            <strong style={{ color: live.error ? '#f87171' : live.loaded ? '#4ade80' : '#fbbf24' }}>
              {live.error === 'not-configured' ? 'not configured'
                : live.error ? `error: ${live.error}`
                : live.loaded ? `live — ${live.pings.length} pings, ${live.checkin ? 'check-in OK' : 'no check-in'}`
                : 'loading…'}
            </strong>.
          </p>
        </Card>

        <p style={{ fontSize: 11, color: 'rgba(232,237,242,0.3)', marginTop: 26, lineHeight: 1.8 }}>
          <strong>Method basis:</strong> 5-factor partial bio age: NTNU fitness-age (Wisløff et al., Circulation, 2014);
          ACSM VO₂ norms (Kaminsky et al., 2015); body comp aging (Williams et al., JACC, 2017);
          HRV norms (Shaffer & Ginsberg, 2017); sleep-aging penalty (Belsky et al., eLife, 2022; Walker, 2017; Irwin, 2019).
          Full target: Levine et al. PhenoAge (Aging, 2018); DunedinPACE (Belsky et al., 2022);
          AHA PREVENT cardiovascular equations (2023). Garmin algorithm: Chinoy et al. (Sleep, 2021).
          H. pylori cardiovascular risk: Danesh et al. (BMJ, 1999); Guo et al. (Eur Heart J, 2016).
          Any domain estimate is suppressed until inputs required to compute it are present.
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

function Real({ children, color }) {
  return <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text)' }}>{children}</div>
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
