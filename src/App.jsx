import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'

/* ============================================================
   Health OS — plain-language health dashboard
   ---
   Design principle (2026-05-31 redesign):
   · Top layer speaks in plain English — one verdict + one number
     per domain, no jargon. Colour says good / watch / act.
   · Click any node to open its drawer: full-sentence explanation
     of what the number means and the peer-reviewed research behind
     the commentary.
   · A "latest-wins" snapshot strip shows whichever signal — Garmin,
     Strava, Pulse ping, or weekly check-in — was logged most recently.
   ---
   2026-05-31 data update:
   · New Garmin week (May 24–31) ingested as DAILY sleep — best week
     yet (~81 avg, Good), with May 31 a deliberate outlier (stayed up
     for the Champions League final → 4h 09m, score 35).
   · 2nd gym session added (May 30 — legs + back + posterior chain).
   · New easy run added (5.07 km @ 6:06/km).
   · Bio age recomputed with the improved sleep week.
   · New Nutrition node: research-based macro targets, qualitative
     "are you hitting them?" read, micronutrient panel, and diet
     strengths/shortcomings — no calorie or macro counting.
   ============================================================ */

const CHRONO_AGE = 22.4   // years
const UPDATED = '2026-05-31'

/* ── status palette — drives every node's colour ──────────── */
const STATUS = {
  good:    { c: '#4ade80', word: 'Healthy' },
  watch:   { c: '#fbbf24', word: 'Keep an eye on' },
  act:     { c: '#f87171', word: 'Needs action' },
  info:    { c: '#60a5fa', word: 'For info' },
  neutral: { c: '#94a3b8', word: 'Neutral' },
}

// ─── Garmin — sleep is now DAILY for the week of May 24–31 ──────────────────
const GARMIN = {
  sleep: {
    // One row per night. `outlier` nights are excluded from the weekly average.
    recentDays: [
      { date: '2026-05-24', label: 'Sat 24', score: 82, durMin: 437, quality: 'Good' },
      { date: '2026-05-25', label: 'Sun 25', score: 67, durMin: 431, quality: 'Fair', tag: '1h 56m awake' },
      { date: '2026-05-26', label: 'Mon 26', score: 83, durMin: 420, quality: 'Good' },
      { date: '2026-05-27', label: 'Tue 27', score: 88, durMin: 499, quality: 'Good', tag: 'best night' },
      { date: '2026-05-28', label: 'Wed 28', score: 79, durMin: 420, quality: 'Fair' },
      { date: '2026-05-29', label: 'Thu 29', score: 84, durMin: 487, quality: 'Good' },
      { date: '2026-05-30', label: 'Fri 30', score: 83, durMin: 412, quality: 'Good' },
      { date: '2026-05-31', label: 'Sat 31', score: 35, durMin: 249, quality: 'Poor', outlier: true, tag: 'Champions League final' },
    ],
    needMin: 480,                 // ~8h nightly need (Garmin)
    weekAvgScore: 80.9,           // mean of the 7 normal nights (excl. May 31)
    weekAvgDurMin: 444,           // 7h 24m, normal nights only
    prevBaselineScore: 75.8,      // previous 5-week baseline, for the trend arrow
    prevBaselineDurMin: 412,      // 6h 52m
    dominantQuality: 'Good',
    bestNightScore: 88,
    outlier: { date: '2026-05-31', reason: 'Stayed up for the Champions League final', score: 35, durMin: 249, hrv: 42, stress: 41 },
  },
  hrv: { baselineLow: 50, baselineHigh: 74, sevenDayAvg: 69, latestOvernight: 75, outlierNight: 42, unit: 'ms (RMSSD)' },
  vo2max: { current: 54.1, peak: 54.4, start: 52.6, trend: '+1.5 over 12 months', acsm: 'Excellent (51.0–55.9, men 20–29)' },
  halfMarathon: { date: '2025-08-10', distanceKm: 21.24, time: '1:50:58', pacePerKm: '5:13 /km', avgHR: 170, maxHR: 183 },
  running: {
    monthRuns: 6, yearlyAvg: 4.0,
    latestRun: { date: '2026-05-29', distanceKm: 5.07, time: '30:58', pacePerKm: '6:06 /km', avgHR: 147, maxHR: 160, kind: 'easy aerobic' },
  },
}

// ─── InBody 580 — 2025-05-13 · 171 cm · 21yo Male ───────────────────────────
const INBODY = {
  date: '2025-05-13',
  weight: 67.8, targetWeight: 66.4,
  bodyFatMass: 11.4, bodyFatPct: 16.8,
  smm: 31.7, bmi: 23.2, score: 80,
  vfa: 41.6, ecwRatio: 0.375, bmr: 1589, bmc: 3.17, bcm: 37.1, smi: 8.4, whr: 0.77,
  icw: 25.9, ecw: 15.5,
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
  fbcComment: 'Your red cells are slightly smaller than the lab’s reference range (MCV 75, MCH 25), but your haemoglobin is normal at 146 and your iron stores are adequate. The pathologist’s read is that this is most likely alpha-thalassaemia trait — a harmless, inherited variant that is common in people of Vietnamese and Southeast Asian descent and causes small red cells without true anaemia. A haemoglobin electrophoresis test would confirm it. It is not counted as an aging penalty.',
  iron: [
    { name: 'S Iron',              value: 13,  unit: 'umol/L', range: '5–30',   st: 'ok' },
    { name: 'S Transferrin',       value: 2.6, unit: 'g/L',    range: '2.0–3.2',st: 'ok' },
    { name: 'Transferrin Sat.',    value: 20,  unit: '%',       range: '10–45',  st: 'ok' },
    { name: 'S Ferritin',          value: 44,  unit: 'ng/mL',  range: '30–500', st: 'ok' },
  ],
  ferritinNote: 'Ferritin 44 ng/mL is inside the lab range but low-normal for a man (the functional sweet spot is roughly 50–80). A past H. pylori infection probably blunted iron absorption. Recheck it at the same blood draw as your clearance test.',
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
    treatmentStatus: 'completed',
    treatmentRegimen: 'Bismuth quadruple therapy · 14 days',
    treatmentDrugs: 'Colloidal bismuth subcitrate + Nexium MUPS (esomeprazole) + Tetracycline + Metronidazole',
    treatmentEnded: '2026-05-14',
    clearanceTestFrom: '2026-06-25',
    ppiStopDate: '2026-06-11',
  },
  missingForPhenoAge: ['Fasting glucose', 'hs-CRP'],
  phenoAgeInputsPresent: 7,
}

// ─── Gym / Hevy — now 2 sessions this week ───────────────────────────────────
const GYM = {
  totalSessions: 2,
  sessions: [
    {
      date: '2026-05-30', name: 'Evening workout', durationMin: 80, focus: 'Legs · back · posterior chain',
      note: 'Full lower + pull day — first proper leg session back.',
      lifts: [
        { name: 'Romanian Deadlift (BB)', topSet: '60 kg × 8', sets: 3 },
        { name: 'Full Squat (BB)',        topSet: '60 kg × 10', sets: 3 },
        { name: 'Lat Pulldown (Cable)',   topSet: '50 kg × 12', sets: 3 },
        { name: 'Pull-Up (BW)',           topSet: 'BW × 10', sets: 3, note: '10 / 8 / 4 — honest reps' },
        { name: 'Hip Thrust (Machine)',   topSet: '30 kg × 12', sets: 3 },
        { name: 'Rear-Delt Fly (Machine)',topSet: '10 kg × 10', sets: 2 },
      ],
    },
    {
      date: '2026-05-28', name: 'Uppers Push', durationMin: 49, focus: 'Chest · shoulders · triceps',
      gymNote: '"Making good use of a $17/week investment"',
      note: 'Bit rusty — returning from illness.',
      lifts: [
        { name: 'Bench Press (BB)',       topSet: '65 kg × 6', sets: 4, note: 'working max' },
        { name: 'Incline DB Press',       topSet: '15 kg × 12', sets: 2 },
        { name: 'Triceps Dip (Weighted)', topSet: 'BW+2.5 kg × 12', sets: 2 },
        { name: 'Lateral Raise (DB)',     topSet: '8 kg × 12', sets: 2 },
      ],
    },
  ],
}

// ─── Nutrition — research-based targets, NO calorie/macro counting ───────────
//
// Energy: InBody BMR 1589 kcal × activity factor ~1.6 (trains 3–5×/wk + runs)
//   → maintenance ≈ 2,500–2,700 kcal. Shown as a range, never a calculator.
// Protein: Morton et al. (Br J Sports Med, 2018) meta-analysis (n=1,863) found
//   resistance-training gains plateau around 1.6 g/kg/day (CI 1.03–2.20); the
//   upper end suits an actively training lifter → 1.6–2.2 g/kg × 67.8 kg ≈ 110–150 g.
// Carb / fat: IOM Acceptable Macronutrient Distribution Ranges — carbohydrate
//   45–65% and fat 20–35% of energy.
const MACRO_TARGETS = {
  weightKg: 67.8,
  energy: { low: 2500, high: 2700, unit: 'kcal/day', plate: 'roughly three solid meals plus a snack on training days' },
  macros: [
    { name: 'Protein', plain: 'Builds and repairs muscle', target: '110–150 g/day', plate: 'a palm of protein at every meal — eggs, chicken, fish, tofu, dairy, legumes', source: 'Morton et al., Br J Sports Med 2018 (1.6 g/kg breakpoint)' },
    { name: 'Carbs',   plain: 'Fuels training and recovery', target: '45–65% of energy', plate: 'fill up around runs and gym days — oats, rice, fruit, potatoes', source: 'IOM Acceptable Macronutrient Distribution Range' },
    { name: 'Fat',     plain: 'Hormones and joint health', target: '20–35% of energy', plate: 'a thumb of healthy fat per meal — olive oil, nuts, avocado, oily fish', source: 'IOM Acceptable Macronutrient Distribution Range' },
  ],
  note: 'These are targets, not a calculator. Health OS reads your plain-English meal logs from Pulse and forms an intuition of whether you’re hitting them — it never converts your meals into exact numbers, because portion-level macro maths is mostly false precision.',
}

// Micronutrients most worth watching — the "nutrients of public health concern"
// (2020–2025 Dietary Guidelines for Americans; Linus Pauling Institute review of
// US micronutrient inadequacy) plus iron, which is personally relevant given the
// low-normal ferritin and prior H. pylori. Status is qualitative on purpose.
const MICRONUTRIENTS = {
  panel: [
    { name: 'Iron',        why: 'Carries oxygen in your blood; low stores sap endurance', sources: 'Red meat, lentils, tofu, spinach + vitamin C to absorb', status: 'watch',   note: 'Ferritin low-normal (44) post-H. pylori — your one to actively rebuild.' },
    { name: 'Fibre',       why: 'Feeds the gut microbiome that trains your immune system', sources: 'Whole grains, beans, fruit, veg, nuts', status: 'watch',   note: 'Aim 25–30 g+/day and 30 different plants a week for microbiome diversity.' },
    { name: 'Magnesium',   why: 'Muscle relaxation, sleep quality, energy metabolism', sources: 'Nuts, seeds, dark chocolate, leafy greens, wholegrains', status: 'unknown' },
    { name: 'Vitamin D',   why: 'Bone, immune function and mood', sources: 'Sunlight, oily fish, eggs — plus your D3 supplement', status: 'good',    note: 'On a D3 supplement — adherence tracked via Pulse.' },
    { name: 'Potassium',   why: 'Blood pressure and nerve/muscle signalling', sources: 'Bananas, potatoes, beans, leafy greens, yoghurt', status: 'unknown' },
    { name: 'Calcium',     why: 'Bone density and muscle contraction', sources: 'Dairy, fortified soy, tofu, leafy greens, sardines', status: 'unknown' },
    { name: 'Zinc',        why: 'Immune function, testosterone and wound healing', sources: 'Meat, shellfish, seeds, legumes', status: 'unknown' },
    { name: 'Omega-3',     why: 'Anti-inflammatory; heart and brain', sources: 'Oily fish 2×/week, walnuts, flax/chia', status: 'unknown' },
  ],
  sources: 'Under-consumed nutrients per the 2020–2025 Dietary Guidelines for Americans and the Linus Pauling Institute; fibre/microbiome targets per Reynolds et al. (Lancet, 2019) and plant-diversity work (McDonald et al., American Gut, mSystems 2018; Wastyk et al., Cell, 2021).',
}

// Qualitative diet read — lights up once Pulse meal logs flow in. Until then it
// shows the framework and the known-from-bloodwork starting points.
const DIET_ASSESSMENT = {
  hasMealData: false,
  strengths: [
    'Training focus means protein is front-of-mind — most lifters in your pattern hit the 110–150 g range.',
    'Bloods show no metabolic red flags: liver, kidney, electrolytes and albumin all optimal.',
  ],
  shortcomings: [
    'Iron stores are low-normal — pair iron-rich foods with vitamin C, and recheck ferritin in late June.',
    'Fibre and plant diversity are the most commonly under-eaten — the easiest microbiome win.',
  ],
  unknowns: 'Start logging meals in Pulse (breakfast / lunch / snack / dinner, plain English) and this panel fills in with a real strengths-and-gaps read — no calorie counting.',
}

// ─── Bio age — 5-factor model (recomputed 2026-05-31 with the new sleep week) ─
//
// Factor 1 — VO₂ max [0.30] → 20.5 yrs  (54.1 ml/kg/min, Excellent; Wisløff 2014)
// Factor 2 — Body comp [0.25] → 19.5 yrs (PBF 16.8%, VFA 41.6; Williams 2017)
// Factor 3 — Sleep [0.20] → 22.2 yrs  (this week ~81 / 7h24 is the best yet and
//   nearly closes the deficit, BUT one improved week is a trend, not a new
//   baseline — and the May 31 all-nighter shows the system is still fragile, so
//   the penalty is only partly lifted vs the old 23.1; Belsky DunedinPACE 2022)
// Factor 4 — Overnight HRV [0.15] → 21.0 yrs (7-day RMSSD 69 ms; Shaffer 2017)
// Factor 5 — Partial bloods [0.10] → 20.0 yrs (7/9 PhenoAge inputs; Levine 2018)
//
// Composite: (20.5×.30)+(19.5×.25)+(22.2×.20)+(21.0×.15)+(20.0×.10)
//   = 6.15+4.875+4.44+3.15+2.00 = 20.62 → ~21 yrs · Δ −1.8 · CI ±1.5
const FITNESS_BIO_AGE = {
  estimate: 21,
  confidenceLow: 19, confidenceHigh: 22,
  delta: -1.8,
  domains: [
    { name: 'Fitness (VO₂ max)',     weight: 0.30, ageEst: 20.5, source: 'Wisløff et al. 2014; ACSM norms' },
    { name: 'Body composition',      weight: 0.25, ageEst: 19.5, source: 'Williams et al. JACC 2017; PBF 16.8%, VFA 41.6' },
    { name: 'Sleep quality',         weight: 0.20, ageEst: 22.2, source: 'Belsky et al. DunedinPACE 2022' },
    { name: 'Heart-rate variability',weight: 0.15, ageEst: 21.0, source: 'Shaffer & Ginsberg 2017' },
    { name: 'Blood markers (partial)',weight: 0.10, ageEst: 20.0, source: 'Levine PhenoAge inputs' },
  ],
  stillNeeded: ['Fasting glucose', 'hs-CRP', 'Grip strength', 'Blood pressure'],
}

// ─── Inputs registry ─────────────────────────────────────────────────────────
const INPUTS = [
  { key: 'sleep_hours',  label: 'Sleep duration',          source: 'Garmin',              present: true,  value: '7h 24m avg this week' },
  { key: 'sleep_score',  label: 'Sleep score',             source: 'Garmin',              present: true,  value: '80.9 avg (Good)' },
  { key: 'hrv',          label: 'HRV (overnight)',         source: 'Garmin',              present: true,  value: '69 ms · 7-day avg' },
  { key: 'vo2',          label: 'VO₂ max',                 source: 'Garmin (FirstBeat)',  present: true,  value: '54.1 ml/kg/min' },
  { key: 'body_battery', label: 'Body battery',            source: 'Garmin',              present: true,  value: '+61 to +77 on good nights' },
  { key: 'gym',          label: 'Gym sessions',            source: 'Hevy',                present: true,  value: '2 sessions this week' },
  { key: 'running',      label: 'Running',                 source: 'Garmin/Strava',       present: true,  value: '6 runs · latest 5.07 km' },
  { key: 'food',         label: 'Meals / diet quality',    source: 'Pulse meals',         present: false },
  { key: 'macros',       label: 'Macro adequacy',          source: 'Pulse meals',         present: false },
  { key: 'teeth',        label: 'Teeth brushing',          source: 'Pulse pings',         present: false },
  { key: 'skin',         label: 'Skincare / grooming',     source: 'Pulse pings',         present: false },
  { key: 'd3',           label: 'Vitamin D3 adherence',    source: 'Pulse pings',         present: false },
  { key: 'dexa',         label: 'Body composition',        source: 'InBody 580',          present: true,  value: 'InBody 580 · 2025-05-13' },
  { key: 'bloods',       label: 'Blood panel',             source: 'Melbourne Pathology', present: true,  value: 'Partial · 7/9 PhenoAge inputs' },
  { key: 'bp',           label: 'Blood pressure',          source: 'manual',              present: false },
  { key: 'grip',         label: 'Grip strength',           source: 'manual',              present: false },
]

const CURRENT_SIGNAL = {
  rut_status: 'clear (neutral)',
  flags: [
    'Mid-year self-investment deficit flagged in the 2026-05-18 evening synthesis.',
    'Acute stress event 2026-05-14 (workplace incident; cathartic release).',
    'Self-reported "half-arsing my presence" — somatic energy low.',
  ],
}

/* ── helpers ──────────────────────────────────────────────── */

function hm(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function daysAgoLabel(iso) {
  // Compare calendar dates only (YYYY-MM-DD), parsed at local midnight, so the
  // label never drifts a day due to UTC conversion.
  const then = new Date(iso + 'T00:00:00')
  const now = new Date(UPDATED + 'T00:00:00')
  const d = Math.round((now - then) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

// YYYY-MM-DD for a Date, using LOCAL calendar fields (not UTC) so the snapshot
// label matches the day the signal was actually logged.
function localDateStr(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/* ── small atoms ──────────────────────────────────────────── */

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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '30px 0 12px' }}>
      <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{children}</h2>
      {hint && <span style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.3)' }}>{hint}</span>}
    </div>
  )
}

function Cite({ children }) {
  return <em style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', fontStyle: 'italic' }}>{children}</em>
}

// Blood marker row — prop is `range` not `ref` (ref is reserved in React)
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

/* ── THE core pattern: a plain-language node that opens to detail ──────────── */

function HealthNode({ emoji, title, verdict, status = 'info', metric, metricLabel, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const s = STATUS[status]
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
      borderLeft: `3px solid ${s.c}`, borderRadius: 12, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: s.c, background: `${s.c}1a`, border: `1px solid ${s.c}33`, borderRadius: 20, padding: '1px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.word}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{verdict}</div>
        </div>
        {metric != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c, lineHeight: 1.1 }}>{metric}</div>
            {metricLabel && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{metricLabel}</div>}
          </div>
        )}
        <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0, marginLeft: 2, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
      </button>
      {open && (
        <div style={{ padding: '4px 18px 20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ height: 12 }} />
          {children}
        </div>
      )}
    </div>
  )
}

// Plain paragraph inside a drawer
function P({ children }) {
  return <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7 }}>{children}</p>
}

/* ── the snapshot strip: latest-wins across every source ──────────────────── */

function buildSnapshot(live) {
  // Each candidate: { when: Date, source, line }. Most recent wins.
  const cands = []
  const sleep = GARMIN.sleep.recentDays[GARMIN.sleep.recentDays.length - 1]
  cands.push({
    when: new Date(sleep.date + 'T07:00:00'),
    source: 'Garmin · sleep',
    line: sleep.outlier
      ? `You slept just ${hm(sleep.durMin)} — a one-off after the ${sleep.tag}. Expect to feel it today; tonight's the reset.`
      : `You slept ${hm(sleep.durMin)} with a ${sleep.score} score (${sleep.quality}).`,
  })
  const run = GARMIN.running.latestRun
  cands.push({ when: new Date(run.date + 'T08:00:00'), source: 'Garmin · run', line: `Easy ${run.distanceKm} km run at ${run.pacePerKm}, heart rate averaging ${run.avgHR} — comfortably aerobic.` })
  const gym = GYM.sessions[0]
  cands.push({ when: new Date(gym.date + 'T19:00:00'), source: 'Hevy · gym', line: `${gym.name}: ${gym.focus.toLowerCase()} — ${gym.durationMin} minutes.` })

  // Live Supabase signals, if any arrived more recently.
  if (live.checkin?.week_of) cands.push({ when: new Date(live.checkin.created_at || live.checkin.week_of), source: 'Pulse · check-in', line: 'Latest weekly check-in is in.' })
  if (live.pings?.length) {
    const latest = live.pings.reduce((a, b) => (new Date(a.pinged_at) > new Date(b.pinged_at) ? a : b))
    cands.push({ when: new Date(latest.pinged_at), source: 'Pulse · ping', line: 'Latest habit ping logged.' })
  }
  if (live.meal?.logged_at) cands.push({ when: new Date(live.meal.logged_at), source: 'Pulse · meal', line: `Last meal logged: ${live.meal.description || live.meal.meal_type}.` })

  return cands.sort((a, b) => b.when - a.when)[0]
}

/* ── app ──────────────────────────────────────────────────── */

export default function App() {
  const [live, setLive] = useState({ loaded: false, checkin: null, pings: [], meal: null, error: null })

  useEffect(() => {
    if (!supabase) { setLive(l => ({ ...l, loaded: true, error: 'not-configured' })); return }
    let cancelled = false
    ;(async () => {
      try {
        const [{ data: ci }, { data: pg }, mealRes] = await Promise.all([
          supabase.from('weekly_checkins').select('*').order('week_of', { ascending: false }).limit(1),
          supabase.from('habit_pings').select('*').gte('pinged_at', new Date(Date.now() - 14 * 86400000).toISOString()),
          // `meals` may not exist yet (Phase 2) — swallow the error gracefully.
          supabase.from('meals').select('*').order('logged_at', { ascending: false }).limit(1).then(r => r, () => ({ data: null })),
        ])
        if (!cancelled) setLive({ loaded: true, checkin: ci?.[0] || null, pings: pg || [], meal: mealRes?.data?.[0] || null, error: null })
      } catch (e) {
        if (!cancelled) setLive(l => ({ ...l, loaded: true, error: e?.message || 'fetch-failed' }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Pulse ping adherence (meals / teeth / skincare) from live data.
  const pingAdherence = {}
  for (const p of live.pings) {
    if (!p.responses) continue
    for (const [k, v] of Object.entries(p.responses)) {
      if (!pingAdherence[k]) pingAdherence[k] = { yes: 0, total: 0 }
      pingAdherence[k].total += 1
      if (v) pingAdherence[k].yes += 1
    }
  }

  const presentCount = INPUTS.filter(i => i.present).length
  const coverage = Math.round((presentCount / INPUTS.length) * 100)
  const fba = FITNESS_BIO_AGE
  const snap = buildSnapshot(live)
  const sleep = GARMIN.sleep
  const scoreDelta = +(sleep.weekAvgScore - sleep.prevBaselineScore).toFixed(1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>

      <header style={{
        background: 'linear-gradient(135deg, #0d1b2a, #14342b, #0f3460)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '24px',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, fontSize: 19,
            background: 'linear-gradient(135deg, #4ade80, #0f3460)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>🧬</div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 700 }}>Health OS</h1>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Your health in plain English · tap any card for the detail · updated {UPDATED}
            </p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '22px 20px 70px' }}>

        {/* ── Latest-wins snapshot ─────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(96,165,250,0.06))',
          border: '1px solid rgba(74,222,128,0.18)', borderRadius: 14, padding: '16px 18px',
          display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18,
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>📍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 4 }}>
              Right now · {daysAgoLabel(localDateStr(snap.when))} · {snap.source}
            </div>
            <div style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.55 }}>{snap.line}</div>
          </div>
        </div>

        {/* ── Headline: bio age ────────────────────────────────── */}
        <HealthNode
          emoji="🧬"
          title="Biological age"
          status="good"
          verdict={`Your body is running about ${Math.abs(fba.delta)} years younger than your actual age.`}
          metric={fba.estimate}
          metricLabel={`vs ${CHRONO_AGE} actual`}
          defaultOpen
        >
          <P>
            We blend five signals into one number: your fitness, your body composition, your sleep,
            your heart-rate variability, and your blood markers. Right now they average to about{' '}
            <strong style={{ color: '#4ade80' }}>{fba.estimate} years</strong> — roughly{' '}
            {Math.abs(fba.delta)} years younger than your {CHRONO_AGE}. The range is{' '}
            {fba.confidenceLow}–{fba.confidenceHigh} years; it tightens as you add the last couple of blood tests.
          </P>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {fba.domains.map(d => (
              <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '190px 60px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{d.name}</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>{d.ageEst} yrs</span>
                <span style={{ color: 'rgba(232,237,242,0.4)', fontSize: 11.5 }}>{Math.round(d.weight * 100)}% weight · {d.source}</span>
              </div>
            ))}
          </div>
          <P>
            <strong style={{ color: '#fbbf24' }}>To sharpen it:</strong> two more blood tests (fasting glucose
            and hs-CRP) unlock the full validated Levine PhenoAge formula. A home grip-strength reading and a
            blood-pressure cuff would round out the picture.
          </P>
          <Cite>
            Method: NTNU fitness-age (Wisløff et al., Circulation, 2014); ACSM VO₂ norms (Kaminsky et al., 2015);
            body-composition aging (Williams et al., JACC, 2017); HRV norms (Shaffer & Ginsberg, 2017);
            sleep-aging pace (Belsky et al., eLife, 2022); target formula Levine et al. PhenoAge (Aging, 2018).
          </Cite>
        </HealthNode>

        <SectionTitle>This week</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Sleep ──────────────────────────────────────────── */}
          <HealthNode
            emoji="😴"
            title="Sleep"
            status="good"
            verdict={`Your best week yet — about ${Math.round(sleep.weekAvgScore)} out of 100. One all-nighter for the final.`}
            metric={Math.round(sleep.weekAvgScore)}
            metricLabel="/ 100 avg"
          >
            <P>
              Across the seven normal nights you averaged a <strong style={{ color: '#4ade80' }}>{Math.round(sleep.weekAvgScore)} score</strong>{' '}
              and <strong style={{ color: '#4ade80' }}>{hm(sleep.weekAvgDurMin)}</strong> in bed — up from your
              previous baseline of {sleep.prevBaselineScore} and {hm(sleep.prevBaselineDurMin)}. That’s a jump of{' '}
              {scoreDelta > 0 ? '+' : ''}{scoreDelta} points, and you’ve nearly closed the nightly sleep
              deficit that had been the single biggest drag on your biological age.
            </P>

            {/* daily mini-trend */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 10 }}>
              {sleep.recentDays.map(d => {
                const col = d.outlier ? '#f87171' : d.score >= 80 ? '#4ade80' : d.score >= 70 ? '#fbbf24' : '#f87171'
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{d.score}</span>
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 60, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                      <div style={{ width: '100%', height: `${d.score}%`, background: col, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{d.label.split(' ')[1]}</span>
                  </div>
                )
              })}
            </div>

            <div style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 13px', marginBottom: 12 }}>
              <strong style={{ color: '#f87171' }}>The red bar (Sat 31):</strong>{' '}
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                just {hm(sleep.outlier.durMin)}, score {sleep.outlier.score} — you stayed up for the
                Champions League final. Heart-rate variability dropped to {sleep.outlier.hrv} ms and overnight
                stress spiked to {sleep.outlier.stress}. This is flagged as a one-off and left out of your weekly
                average — a single late night isn’t a pattern, but back-to-back ones would be.
              </span>
            </div>

            <P>
              <strong style={{ color: 'var(--text)' }}>Why sleep matters most here:</strong> chronic short sleep
              switches on inflammatory pathways within days (Irwin, Nat Rev Immunol, 2019) and is one of the top
              modifiable accelerators of biological aging (Belsky et al., eLife, 2022). Holding this week’s
              ~7h 24m as your new normal is the highest-leverage thing in the whole dashboard.
            </P>
            <Cite>Garmin sleep score validated against polysomnography in Chinoy et al. (Sleep, 2021).</Cite>
          </HealthNode>

          {/* ── Strength / gym ─────────────────────────────────── */}
          <HealthNode
            emoji="💪"
            title="Strength training"
            status="good"
            verdict={`Back in the gym — ${GYM.totalSessions} sessions this week, and you finally trained legs.`}
            metric={GYM.totalSessions}
            metricLabel="sessions"
          >
            <P>
              Two sessions logged: a <strong style={{ color: 'var(--text)' }}>push day</strong> (bench up to
              65 kg) and a full <strong style={{ color: 'var(--text)' }}>legs-and-back day</strong> (squats,
              Romanian deadlifts, pull-ups, hip thrusts). That second one matters — your InBody scan showed arms
              sitting at ~94% of their lean ideal while legs were already at 107–109%, so balancing upper-body
              push/pull with the posterior chain is exactly the right programming.
            </P>
            {GYM.sessions.map(s => (
              <div key={s.date} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                  {s.name} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· {s.date} · {s.durationMin} min · {s.focus}</span>
                </div>
                {s.note && <div style={{ fontSize: 12, color: 'rgba(232,237,242,0.4)', fontStyle: 'italic', marginBottom: 6 }}>{s.note}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginTop: 6 }}>
                  {s.lifts.map(l => (
                    <div key={l.name} style={{ padding: '8px 10px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.name}</div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#a78bfa' }}>{l.topSet}</div>
                      <div style={{ fontSize: 10, color: 'rgba(232,237,242,0.35)' }}>{l.sets} sets{l.note ? ` · ${l.note}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </HealthNode>

          {/* ── Running / cardio ───────────────────────────────── */}
          <HealthNode
            emoji="🏃"
            title="Running & heart fitness"
            status="good"
            verdict="Top ~20% cardio fitness for your age, ticking over with easy aerobic runs."
            metric={GARMIN.vo2max.current}
            metricLabel="VO₂ max"
          >
            <P>
              Your <strong style={{ color: '#4ade80' }}>VO₂ max of {GARMIN.vo2max.current}</strong> — the size of
              your aerobic engine — sits in the Excellent band for men your age (about the top 20%), and it’s
              climbed {GARMIN.vo2max.trend}. This is the single strongest predictor of long-term health we can
              measure here: every step up in fitness meaningfully lowers cardiovascular risk.
            </P>
            <P>
              Latest run: an <strong style={{ color: 'var(--text)' }}>easy {GARMIN.running.latestRun.distanceKm} km</strong>{' '}
              at {GARMIN.running.latestRun.pacePerKm}, heart rate averaging {GARMIN.running.latestRun.avgHR} bpm —
              comfortably aerobic, the kind of low-stress mileage that builds the engine without digging a recovery hole.
              Your half-marathon PB stands at {GARMIN.halfMarathon.time} ({GARMIN.halfMarathon.pacePerKm}).
            </P>
            <P>
              <strong style={{ color: 'var(--text)' }}>Heart-rate variability</strong> — how recovered your nervous
              system is — averaged {GARMIN.hrv.sevenDayAvg} ms this week (higher is better; you’re around the
              73rd percentile). It dropped to {GARMIN.hrv.outlierNight} ms after the late night, then recovered.
            </P>
            <Cite>
              Mandsager et al. (JAMA, 2018) and Myers et al. (NEJM, 2002) on fitness and mortality; HRV norms
              Shaffer & Ginsberg (Front Public Health, 2017).
            </Cite>
          </HealthNode>
        </div>

        <SectionTitle>Your body</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Body composition ───────────────────────────────── */}
          <HealthNode
            emoji="⚖️"
            title="Body composition"
            status="good"
            verdict="Lean and athletic — low body fat, healthy visceral fat, balanced muscle."
            metric={`${INBODY.bodyFatPct}%`}
            metricLabel="body fat"
          >
            <P>
              From your InBody 580 scan: <strong style={{ color: '#4ade80' }}>{INBODY.bodyFatPct}% body fat</strong>{' '}
              (athletic range), <strong style={{ color: '#4ade80' }}>{INBODY.smm} kg of muscle</strong>, and only{' '}
              {INBODY.vfa} cm² of visceral fat — the deep belly fat that actually drives disease risk, where
              anything under 100 is good. Your overall InBody score is {INBODY.score}/100.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Muscle balance (vs ideal)</div>
                {INBODY.segmental.map(s => <SegBar key={s.part} {...s} />)}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>In plain terms</div>
                <P>
                  Arms are your lagging area (~94%), legs are ahead (107–109%). Nothing here is a concern — it just
                  tells you where to push. The scan is a year old now ({INBODY.date}); a repeat would show what the
                  training has changed.
                </P>
              </div>
            </div>
          </HealthNode>

          {/* ── Blood panel ────────────────────────────────────── */}
          <HealthNode
            emoji="🩸"
            title="Blood work"
            status="watch"
            verdict="Everything important is healthy. Two small follow-ups to close out."
            metric="2"
            metricLabel="follow-ups"
          >
            <P>
              The big picture is reassuring: <strong style={{ color: '#4ade80' }}>liver, kidney, thyroid,
              electrolytes and albumin are all optimal</strong>, and there are no metabolic red flags. Two things
              are worth a small amount of attention.
            </P>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>1 · Iron stores (ferritin 44)</div>
              <P>{BLOOD.ferritinNote}</P>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>2 · Small red cells (likely harmless)</div>
              <P>{BLOOD.fbcComment}</P>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', marginTop: 6, marginBottom: 6 }}>Flagged markers</div>
            {BLOOD.fbc.filter(m => m.st !== 'ok').map(m => <MRow key={m.name} {...m} />)}
            {BLOOD.iron.filter(m => m.name === 'S Ferritin').map(m => <MRow key={m.name} {...m} />)}
            <div style={{ height: 12 }} />
            <P>
              <strong style={{ color: 'var(--text)' }}>Still to collect:</strong> fasting glucose and hs-CRP (a
              sensitive inflammation marker) — the last 2 of 9 inputs for the gold-standard PhenoAge calculation.
              Best done at one fasting morning visit, ideally bundled with the H. pylori clearance draw in late June.
            </P>
          </HealthNode>

          {/* ── Gut infection (H. pylori) ──────────────────────── */}
          <HealthNode
            emoji="🦠"
            title="Gut infection (H. pylori)"
            status="watch"
            verdict="Treated successfully. One breath test in late June to confirm it's gone."
            metric="✓"
            metricLabel="treated"
          >
            <P>
              You completed a 14-day course of <strong style={{ color: 'var(--text)' }}>bismuth quadruple
              therapy</strong> on {BLOOD.hpylori.treatmentEnded}. H. pylori is a stomach bacterium that, left in
              place, nudges up inflammation and impairs iron absorption — which is part of why your ferritin and
              ESR are slightly off. Both should improve now it’s cleared.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12.5 }}>Stop the PPI (Nexium)</div>
                <div style={{ color: 'var(--text)', fontWeight: 700, marginTop: 2 }}>{BLOOD.hpylori.ppiStopDate}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>At least 2 weeks before the breath test, or you get a false negative.</div>
              </div>
              <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12.5 }}>Clearance breath test</div>
                <div style={{ color: 'var(--text)', fontWeight: 700, marginTop: 2 }}>From {BLOOD.hpylori.clearanceTestFrom}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Earliest 6 weeks after antibiotics. No referral needed at 4Cyte.</div>
              </div>
            </div>
            <Cite>H. pylori linked to cardiovascular and iron effects until eradicated — Danesh et al. (BMJ, 1999); Guo et al. (Eur Heart J, 2016).</Cite>
          </HealthNode>
        </div>

        <SectionTitle>Food &amp; nutrition</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Diet / macros ──────────────────────────────────── */}
          <HealthNode
            emoji="🍽️"
            title="What to eat"
            status="info"
            verdict="Your targets, set from your age and body. Log meals in Pulse to see how you're tracking."
            metric="110+"
            metricLabel="g protein"
          >
            <P>
              These come from your age, weight ({MACRO_TARGETS.weightKg} kg) and training load — not a generic
              calculator. The point isn’t to count: it’s to know what a good day looks like and build the
              intuition.
            </P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {MACRO_TARGETS.macros.map(m => (
                <div key={m.name} style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.14)', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{m.target}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{m.plain}. On a plate: {m.plate}.</div>
                  <Cite>{m.source}</Cite>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Daily energy ≈ <strong style={{ color: 'var(--text)' }}>{MACRO_TARGETS.energy.low.toLocaleString()}–{MACRO_TARGETS.energy.high.toLocaleString()} {MACRO_TARGETS.energy.unit}</strong> — {MACRO_TARGETS.energy.plate}.
              </div>
            </div>
            <P>{MACRO_TARGETS.note}</P>
          </HealthNode>

          {/* ── Macro adequacy (qualitative) ───────────────────── */}
          <HealthNode
            emoji="🥗"
            title="Are you hitting them?"
            status={DIET_ASSESSMENT.hasMealData ? 'good' : 'info'}
            verdict={DIET_ASSESSMENT.hasMealData ? 'Read from your recent meals — no calorie counting.' : 'Waiting on meal logs from Pulse to form a read.'}
            metric={DIET_ASSESSMENT.hasMealData ? '—' : '⏳'}
          >
            <P>
              Once you’re logging meals in Pulse, Health OS reads them in plain English and forms an{' '}
              <strong style={{ color: 'var(--text)' }}>intuition</strong> of whether protein, carbs and fat are
              roughly on target — not a number. Exact macros from portion sizes are mostly false precision; a
              directional read (on track / a bit short / unknown) is more honest and more useful.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>Strengths</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {DIET_ASSESSMENT.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, paddingLeft: 14, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: '#4ade80' }}>+</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>Watch</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {DIET_ASSESSMENT.shortcomings.map((s, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, paddingLeft: 14, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: '#fbbf24' }}>!</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 8, fontSize: 12.5, color: 'var(--muted)' }}>
              {DIET_ASSESSMENT.unknowns}
            </div>
          </HealthNode>

          {/* ── Micronutrients ─────────────────────────────────── */}
          <HealthNode
            emoji="🧪"
            title="Vitamins & minerals"
            status="watch"
            verdict="The ones most people miss — iron and fibre are your two to prioritise."
            metric={MICRONUTRIENTS.panel.filter(m => m.status === 'watch').length}
            metricLabel="to prioritise"
          >
            <P>
              These are the micronutrients research most often finds under-eaten, plus iron, which is personally
              relevant for you. We don’t measure intake to the milligram — the panel shows where your diet is
              likely strong and where to aim, based on the foods you eat.
            </P>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MICRONUTRIENTS.panel.map(m => {
                const col = m.status === 'good' ? '#4ade80' : m.status === 'watch' ? '#fbbf24' : '#94a3b8'
                const word = m.status === 'good' ? 'covered' : m.status === 'watch' ? 'prioritise' : 'log meals'
                return (
                  <div key={m.name} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{m.why}.</div>
                      <div style={{ fontSize: 11.5, color: 'rgba(232,237,242,0.4)', marginTop: 3 }}>Get it from: {m.sources}.</div>
                      {m.note && <div style={{ fontSize: 11.5, color: col, marginTop: 3 }}>{m.note}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{word}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <Cite>{MICRONUTRIENTS.sources}</Cite>
            </div>
          </HealthNode>
        </div>

        <SectionTitle>Mind &amp; habits</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── State of mind ──────────────────────────────────── */}
          <HealthNode
            emoji="🧠"
            title="State of mind"
            status="neutral"
            verdict="Clear and neutral. A couple of low-energy notes worth keeping in view."
            metric="OK"
          >
            <P>Drawn from your recent journals (the journal-scout agent). Rut status: <strong style={{ color: '#fbbf24' }}>{CURRENT_SIGNAL.rut_status}</strong>.</P>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CURRENT_SIGNAL.flags.map((f, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#fbbf24' }}>·</span>{f}
                </li>
              ))}
            </ul>
          </HealthNode>

          {/* ── Habits (Pulse) ─────────────────────────────────── */}
          <HealthNode
            emoji="🪥"
            title="Daily habits"
            status={Object.keys(pingAdherence).length ? 'good' : 'info'}
            verdict={Object.keys(pingAdherence).length ? 'Tracked live from your Pulse check-ins.' : 'Set up Pulse to start passively tracking meals, teeth and skincare.'}
            metric={Object.keys(pingAdherence).length || '⏳'}
          >
            <P>
              Pulse fires quick check-ins through the day to capture the small things that compound — eating,
              teeth, skincare, supplements. Those feed straight back here.
            </P>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { key: 'meal', icon: '🍱', label: 'Meals' },
                { key: 'teeth', icon: '🪥', label: 'Teeth' },
                { key: 'skincare', icon: '🧴', label: 'Skincare' },
              ].map(h => {
                const a = pingAdherence[h.key]
                return (
                  <div key={h.key} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{h.icon} {h.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: a ? '#4ade80' : '#fbbf24', marginTop: 3 }}>
                      {a ? `${Math.round((a.yes / a.total) * 100)}% (${a.yes}/${a.total})` : '⏳ awaiting'}
                    </div>
                  </div>
                )
              })}
            </div>
          </HealthNode>
        </div>

        {/* ── Coverage / data robustness ───────────────────────── */}
        <SectionTitle hint="how complete the picture is">Data coverage</SectionTitle>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: coverage >= 60 ? '#4ade80' : '#fbbf24' }}>{coverage}%</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text)' }}>{presentCount} of {INPUTS.length}</strong> inputs are flowing.
              Live data:&nbsp;
              <strong style={{ color: live.error ? '#f87171' : live.loaded ? '#4ade80' : '#fbbf24' }}>
                {live.error === 'not-configured' ? 'static mode'
                  : live.error ? `error: ${live.error}`
                  : live.loaded ? `connected — ${live.pings.length} pings` : 'loading…'}
              </strong>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
            {INPUTS.map(inp => (
              <div key={inp.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: inp.present ? 'var(--text)' : 'var(--muted)' }}>{inp.label}</span>
                <span style={{ color: inp.present ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: 11 }}>{inp.present ? '✓' : '○'}</span>
              </div>
            ))}
          </div>
        </Card>

        <p style={{ fontSize: 11, color: 'rgba(232,237,242,0.3)', marginTop: 24, lineHeight: 1.8 }}>
          <strong>How to read this:</strong> every card shows a plain-English verdict and one number; tap it for
          the full explanation and the research behind it. Commentary is grounded in peer-reviewed sources, cited
          in each drawer. Nothing here is medical advice — it’s a personal dashboard to think with.
        </p>
      </main>
    </div>
  )
}
