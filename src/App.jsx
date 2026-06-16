import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_IDRETT_POLL_MS = 60_000
const LATE_CUTOFF_MINS   = 20

const ELIGIBILITY_RULES = {
  green:  { min: 80, label: 'Kampklar',      color: '#4caf72', bg: '#0d2e1a' },
  yellow: { min: 60, label: 'Må vurderes',   color: '#f5c842', bg: '#2e2600' },
  red:    { min:  0, label: 'Ikke kampklar', color: '#e63946', bg: '#2e0a0e' },
}

const DISCIPLINES = ['Alle', 'Boksing', 'MMA', 'Kickboksing', 'Muay Thai', 'Grappling']

const SCHEDULE = {
  Mandag:   [{ name:'Boksing',   disc:'Boksing',    start:'18:00', end:'19:00', icon:'🥊' },
             { name:'Grappling', disc:'Grappling',  start:'19:00', end:'20:00', icon:'🤼' }],
  Tirsdag:  [{ name:'Grappling',   disc:'Grappling',   start:'18:00', end:'19:00', icon:'🤼' },
             { name:'Kickboksing', disc:'Kickboksing', start:'19:00', end:'20:00', icon:'🦵' }],
  Onsdag:   [{ name:'Mini Spartacus', disc:'MMA', start:'17:00', end:'18:00', icon:'🧸', desc:'Lek • Bevegelse • Kameratskap' },
             { name:'Basic MMA',      disc:'MMA', start:'18:00', end:'19:00', icon:'🥋', desc:'Teknikk • Fundament • Utvikling' },
             { name:'Advance MMA',    disc:'MMA', start:'19:00', end:'20:00', icon:'⚔️', desc:'Teknikk • Strategi • Sparring' }],
  Torsdag:  [{ name:'Muay Thai',        disc:'Muay Thai', start:'18:00', end:'19:00', icon:'🦵' },
             { name:'Boksing',          disc:'Boksing',   start:'19:00', end:'20:00', icon:'🥊' },
             { name:'Sparring Boksing', disc:'Boksing',   start:'20:00', end:'21:00', icon:'🥊' }],
  Fredag:   [{ name:'Mini Spartacus', disc:'MMA', start:'17:00', end:'18:00', icon:'🧸', desc:'Lek • Bevegelse • Kameratskap' },
             { name:'Elite MMA',      disc:'MMA', start:'18:00', end:'19:00', icon:'🏆', desc:'Kun proffer og aktive som går kamp' }],
  Lørdag:   [{ name:'Sparring',           disc:'Boksing', start:'12:00', end:'14:00', icon:'🥊', desc:'Praktisk • Utvikling • Kamperfaring' },
             { name:'Kampsport & Sosialt', disc:'MMA',    start:'21:00', end:'22:30', icon:'🍕', desc:'Alle over 12 år • Gratis • Ingen påmelding' }],
  Søndag:   [{ name:'Kickboksing', disc:'Kickboksing', start:'17:00', end:'18:00', icon:'🦵' }],
}

const DAYS_NO     = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag']
const WEEKDAYS_SMS = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag']

const FAKTURA_KATEGORIER = ['Utstyr','Supporter-utstyr','Treningsklær','Leie','Kurs','Treningsavgift','Dugnad','Annet']
const INTEGRASJONER = [
  { key:'fiken',       label:'Fiken',         color:'#1a6c3d', logo:'🟢', desc:'Norges mest brukte regnskapsapp for lag.' },
  { key:'tripletex',   label:'Tripletex',     color:'#0066cc', logo:'🔵', desc:'Populær norsk løsning for idrettslag.' },
  { key:'poweroffice', label:'PowerOffice',   color:'#f04e23', logo:'🟠', desc:'Komplett økonomiløsning med fakturering.' },
  { key:'24seven',     label:'24SevenOffice', color:'#333',    logo:'⚫', desc:'Alt-i-ett for norske organisasjoner.' },
  { key:'pdf',         label:'Last ned PDF',  color:'#6b21a8', logo:'📄', desc:'Generer PDF – send manuelt eller skriv ut.' },
]

const PAYMENT_PRODUCTS = [
  { id:'treningsavgift',  label:'Treningsavgift (månedlig)', amount:499, icon:'🥋' },
  { id:'kontingent',      label:'Årskontingent NIF',         amount:350, icon:'📋' },
  { id:'utstyr',          label:'Hanske / utstyr',           amount:299, icon:'🥊' },
  { id:'kurs',            label:'Kursavgift',                amount:799, icon:'📚' },
  { id:'enkelttime',      label:'Enkelttime (drop-in)',      amount:150, icon:'🎟️' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toMins   = h => { const [a,b]=h.split(':').map(Number); return a*60+b }
const nowHHMM  = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
const todayISO = () => new Date().toISOString().split('T')[0]
const todayName= () => DAYS_NO[new Date().getDay()===0?6:new Date().getDay()-1]
const daysAgo  = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0] }
const genFakturaNr = () => `SPAR-${new Date().getFullYear()}-${Math.floor(1000+Math.random()*9000)}`

function getSessionRegistrationState(session, nowStr) {
  const now   = toMins(nowStr || nowHHMM())
  const start = toMins(session.start)
  const end   = toMins(session.end)
  const minsIn = now - start
  if (now < start - 30)        return { open:false, late:false, minsIn, reason:'not_open_yet' }
  if (now > end)               return { open:false, late:false, minsIn, reason:'ended' }
  if (minsIn > LATE_CUTOFF_MINS) return { open:false, late:true, minsIn, reason:'closed_late' }
  return { open:true, late:minsIn>0, minsIn }
}

const getOpenSessions   = (day,now) => (SCHEDULE[day||todayName()]||[]).filter(s=>getSessionRegistrationState(s,now).open)
const getActiveSessions = (day,now) => (SCHEDULE[day||todayName()]||[]).filter(s=>{ const st=getSessionRegistrationState(s,now); return st.open||st.reason==='closed_late' })

function calcEligibility(attended, total) {
  if (total===0) return { ...ELIGIBILITY_RULES.red, pct:0 }
  const pct = Math.round((attended/total)*100)
  if (pct >= ELIGIBILITY_RULES.green.min)  return { ...ELIGIBILITY_RULES.green,  pct }
  if (pct >= ELIGIBILITY_RULES.yellow.min) return { ...ELIGIBILITY_RULES.yellow, pct }
  return { ...ELIGIBILITY_RULES.red, pct }
}

function getMiStatus(member) {
  if (!member || member.isGuest || member.notMember) return 'not_member'
  if (member.miUnpaid) return 'unpaid'
  if (member.miActive===false || (member.miExpires && member.miExpires<todayISO())) return 'expired'
  return 'active'
}

const MI_STATUS_DISPLAY = {
  active:     { label:'Aktiv',            color:'#4caf72', bg:'#0d2e1a' },
  expired:    { label:'Utløpt',           color:'#e63946', bg:'#2e0a0e' },
  unpaid:     { label:'Ubetalt faktura',  color:'#f5c842', bg:'#2e2600' },
  not_member: { label:'Ikke medlem',      color:'#777',    bg:'#1a1a1a' },
}

function mockMinIdrettFetch() {
  return new Promise(res => setTimeout(() => {
    const members = [
      { id:'mi_1',  name:'Torpal Merjoev',  disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4791234567' },
      { id:'mi_2',  name:'Erik Strand',     disc:'MMA',         role:'coach',   expires:'2025-12-31', active:true,  unpaid:false, phone:'+4792345678' },
      { id:'mi_3',  name:'Marcus Dahl',     disc:'Boksing',     role:'coach',   expires:'2025-12-31', active:true,  unpaid:false, phone:'+4793456789' },
      { id:'mi_4',  name:'Bjørn Eriksen',   disc:'Boksing',     role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4794567890' },
      { id:'mi_5',  name:'Lena Hagen',      disc:'Kickboksing', role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4795678901' },
      { id:'mi_6',  name:'Nora Vik',        disc:'Grappling',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4796789012' },
      { id:'mi_7',  name:'Anders Haugen',   disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4797890123' },
      { id:'mi_8',  name:'Sofie Lie',       disc:'Muay Thai',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:true,  phone:'+4798901234' },
      { id:'mi_9',  name:'Jonas Berg',      disc:'Boksing',     role:'athlete', expires:'2024-06-30', active:false, unpaid:false, phone:'+4799012345' },
      { id:'mi_10', name:'Emilie Sørensen', disc:'Kickboksing', role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4790123456' },
      { id:'mi_11', name:'Tobias Moe',      disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4791122334' },
      { id:'mi_12', name:'Ylva Næss',       disc:'Grappling',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4792233445' },
    ]
    res({ members, fetchedAt: new Date().toISOString() })
  }, 900))
}

function seedAttendance(members) {
  const attendance = []
  members.forEach(m => {
    for (let i=0; i<90; i++) {
      const date   = daysAgo(i)
      const dayIdx = new Date(date).getDay()
      const dayName= DAYS_NO[dayIdx===0?6:dayIdx-1]
      const sessions = SCHEDULE[dayName]||[]
      if (!sessions.length || Math.random()>0.55) continue
      const sess   = sessions[Math.floor(Math.random()*sessions.length)]
      const r      = Math.random()
      const status = r<0.70?'attended':r<0.88?'strength':'absent'
      const isLate = status!=='absent' && Math.random()>0.80
      attendance.push({
        id:`a${attendance.length}`, memberId:m.id, memberName:m.name,
        date, day:dayName, session:sess.name, disc:sess.disc, status,
        isLate, lateMinutes:isLate?Math.floor(Math.random()*19)+1:0,
        injuryNote:status==='strength'&&Math.random()>0.6?'Skulder':null,
        registeredAt:sess.start, createdAt:new Date(date).toISOString(), miStatus:'active',
      })
    }
  })
  return attendance
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:'#080808', surface:'#111', card:'#161616', border:'#252525',
  accent:'#e8006a', accentL:'#ff4da6',
  gold:'#f4a261', green:'#4caf72', yellow:'#f5c842', red:'#e63946', blue:'#60a5fa', orange:'#fb923c',
  text:'#f2f2f2', muted:'#777', dim:'#444',
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const inputSt = { width:'100%', padding:'14px 16px', borderRadius:10, border:`2px solid ${T.border}`, background:T.card, color:T.text, fontSize:15, outline:'none', boxSizing:'border-box' }
const selSt   = { padding:'8px 10px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, outline:'none' }

function Screen({ children, center }) {
  return <div style={{ display:'flex', flexDirection:'column', alignItems:center?'center':'flex-start', minHeight:'calc(100vh - 58px)', padding:'22px 16px', maxWidth:520, margin:'0 auto' }}>{children}</div>
}
function STitle({ children }) { return <div style={{ fontSize:20, fontWeight:900, marginBottom:12 }}>{children}</div> }
function BigBtn({ children, onClick, style={}, disabled=false }) {
  return <button onClick={onClick} disabled={disabled} style={{ width:'100%', padding:'17px 0', borderRadius:13, border:'none', background:disabled?T.dim:T.accent, color:'#fff', fontWeight:900, fontSize:16, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.6:1, ...style }}>{children}</button>
}
function BackBtn({ onClick }) {
  return <button onClick={onClick} style={{ alignSelf:'flex-start', background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:13, marginBottom:14, padding:0 }}>← Tilbake</button>
}
function Tag({ children, c }) {
  return <span style={{ padding:'3px 8px', borderRadius:99, background:`${c}22`, color:c, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>{children}</span>
}
function Avatar({ name, size=34 }) {
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
  const hue = (name.charCodeAt(0)*37+(name.charCodeAt(name.length-1)||0)*17)%360
  return <div style={{ width:size, height:size, borderRadius:'50%', background:`hsl(${hue},45%,22%)`, border:`1px solid hsl(${hue},45%,35%)`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:size*0.35, color:`hsl(${hue},70%,70%)`, flexShrink:0 }}>{initials}</div>
}
function PctBar({ pct, color }) {
  return <div style={{ display:'flex', alignItems:'center', gap:8 }}>
    <div style={{ width:48, background:T.dim, borderRadius:4, height:6, overflow:'hidden', flexShrink:0 }}>
      <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4 }}/>
    </div>
    <span style={{ color, fontWeight:800, fontSize:12 }}>{pct}%</span>
  </div>
}
function SpartacusLogo({ size=64, showText=true }) {
  return <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:showText?10:0 }}>
    <svg width={size*0.75} height={size} viewBox="0 0 75 100" fill="none">
      <path d="M30 2 C28 8 24 14 20 18 C25 15 32 12 38 10 C36 14 33 20 32 26 L38 20 C42 14 48 8 52 4 C48 6 44 10 40 14 C42 8 40 4 38 2 Z" fill="#fff" opacity="0.92"/>
      <path d="M15 30 C15 18 22 10 37.5 10 C53 10 60 18 60 30 L60 58 C60 68 53 75 37.5 75 C22 75 15 68 15 58 Z" fill="#d0d0d0"/>
      <path d="M15 30 C15 18 22 10 37.5 10 C30 10 24 18 24 30 L24 58 C24 68 28 74 37.5 75 C22 75 15 68 15 58 Z" fill="#a0a0a0"/>
      <path d="M22 42 L22 54 C22 60 26 64 31 64 L37.5 64 L37.5 42 Z" fill="#1a1a1a"/>
      <path d="M53 42 L53 54 C53 60 49 64 44 64 L37.5 64 L37.5 42 Z" fill="#111"/>
      <rect x="35" y="40" width="5" height="28" rx="2.5" fill="#b0b0b0"/>
      <path d="M22 50 C18 52 16 58 18 64 C20 70 26 74 30 74 L22 50 Z" fill="#b8b8b8"/>
      <path d="M53 50 C57 52 59 58 57 64 C55 70 49 74 45 74 L53 50 Z" fill="#a8a8a8"/>
      <rect x="12" y="38" width="51" height="6" rx="3" fill="#c0c0c0"/>
    </svg>
    {showText && <div style={{ fontWeight:900, fontSize:size*0.28, letterSpacing:'0.15em', color:'#fff', textTransform:'uppercase', lineHeight:1 }}>SPARTACUS</div>}
  </div>
}
function MiStatusBanner({ status }) {
  const d = MI_STATUS_DISPLAY[status]||MI_STATUS_DISPLAY['not_member']
  const icons   = { active:'✅', expired:'⛔', unpaid:'⚠️', not_member:'🚫' }
  const notes   = { active:'Gyldig medlem – Min Idrett', expired:'Utløpt – kontakt trener', unpaid:'Ubetalt faktura – kontakt trener', not_member:'Ikke registrert i Min Idrett – gjest' }
  return <div style={{ width:'100%', padding:'10px 14px', borderRadius:9, marginBottom:14, background:d.bg, border:`1.5px solid ${d.color}`, color:d.color, fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
    <span style={{ fontSize:18 }}>{icons[status]}</span>
    <div><div>{d.label}</div><div style={{ fontWeight:500, opacity:0.8, fontSize:11 }}>{notes[status]}</div></div>
  </div>
}
function MiStatusBar({ counts }) {
  const items = [
    { key:'active',     icon:'✅', label:'Aktive',         color:T.green  },
    { key:'expired',    icon:'⛔', label:'Utløpt',          color:T.red    },
    { key:'unpaid',     icon:'⚠️', label:'Ubetalt faktura', color:T.yellow },
    { key:'not_member', icon:'🚫', label:'Ikke medlem',     color:T.muted  },
  ]
  return <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginBottom:14 }}>
    {items.map(it => (
      <div key={it.key} style={{ background:T.card, border:`1px solid ${it.key!=='active'&&counts[it.key]>0?it.color:T.border}`, borderRadius:11, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18 }}>{it.icon}</span>
        <div>
          <div style={{ fontWeight:900, fontSize:22, color:it.color, lineHeight:1 }}>{counts[it.key]||0}</div>
          <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:2 }}>{it.label}</div>
        </div>
      </div>
    ))}
  </div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view, setView]             = useState('kiosk')
  const [members, setMembers]       = useState([])
  const [attendance, setAttendance] = useState([])
  const [adminAuth, setAdminAuth]   = useState(false)
  const [miStatus, setMiStatus]     = useState({ status:'idle', fetchedAt:null, count:0 })

  const syncMinIdrett = useCallback(async () => {
    setMiStatus(s => ({ ...s, status:'syncing' }))
    try {
      const result = await mockMinIdrettFetch()
      const mapped = result.members.map(m => ({
        id:m.id, name:m.name, disc:m.disc, phone:m.phone||'',
        isCoach:m.role==='coach',
        miActive:m.active, miExpires:m.expires,
        miUnpaid:m.unpaid||false, notMember:false,
      }))
      setMembers(mapped)
      setAttendance(prev => prev.length>0 ? prev : seedAttendance(mapped))
      setMiStatus({ status:'ok', fetchedAt:result.fetchedAt, count:mapped.length })
    } catch {
      setMiStatus(s => ({ ...s, status:'error' }))
    }
  }, [])

  useEffect(() => {
    syncMinIdrett()
    const iv = setInterval(syncMinIdrett, MIN_IDRETT_POLL_MS)
    return () => clearInterval(iv)
  }, [syncMinIdrett])

  const addAttendance    = useCallback(e => setAttendance(p => [{ id:`a${Date.now()}`, createdAt:new Date().toISOString(), ...e }, ...p]), [])
  const editAttendance   = useCallback((id,p) => setAttendance(prev => prev.map(a => a.id===id?{...a,...p}:a)), [])
  const deleteAttendance = useCallback(id => setAttendance(p => p.filter(a => a.id!==id)), [])

  const syncColor = miStatus.status==='ok'?T.green:miStatus.status==='syncing'?T.yellow:miStatus.status==='error'?T.red:T.muted
  const nav = [
    { key:'kiosk',    label:'🏃 Innsjekk' },
    { key:'schedule', label:'📅 Timeplan' },
    { key:'dashboard',label:`${adminAuth?'🔓':'🔐'} Admin` },
  ]

  return (
    <div style={{ fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif", background:T.bg, color:T.text, minHeight:'100vh' }}>
      <div style={{ background:'#0d0d0d', borderBottom:`2px solid ${T.accent}`, padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:200, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <SpartacusLogo size={32} showText={false}/>
          <div style={{ fontWeight:900, fontSize:16, letterSpacing:'0.12em' }}>SPARTACUS</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={syncMinIdrett} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 9px', borderRadius:7, border:`1px solid ${syncColor}55`, background:'transparent', color:syncColor, cursor:'pointer', fontSize:10, fontWeight:800 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:syncColor }}/>
            {miStatus.status==='syncing'?'Synker…':miStatus.status==='ok'?`MI ${miStatus.count}`:miStatus.status==='error'?'Feil':'Min Idrett'}
          </button>
          <nav style={{ display:'flex', gap:3 }}>
            {nav.map(n => (
              <button key={n.key} onClick={() => setView(n.key)}
                style={{ padding:'7px 10px', borderRadius:8, border:'none', background:view===n.key?T.accent:'transparent', color:view===n.key?'#fff':T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {view==='kiosk'    && <KioskView    members={members} onAdd={addAttendance}/>}
      {view==='schedule' && <ScheduleView/>}
      {view==='dashboard'&& <Dashboard    members={members} setMembers={setMembers} attendance={attendance} auth={adminAuth} setAuth={setAdminAuth} onEdit={editAttendance} onDelete={deleteAttendance} onSync={syncMinIdrett} miStatus={miStatus}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// KIOSK
// ═══════════════════════════════════════════════════════════════════════════════
function KioskView({ members, onAdd }) {
  const [step, setStep]         = useState('home')
  const [query, setQuery]       = useState('')
  const [session, setSession]   = useState(null)
  const [sessionState, setSessState] = useState(null)
  const [person, setPerson]     = useState(null)
  const [status, setStatus]     = useState(null)
  const [injuryNote, setInj]    = useState('')
  const [miCheck, setMiCheck]   = useState(null)
  const [checking, setChecking] = useState(false)
  const inputRef = useRef()

  const openSessions   = getOpenSessions()
  const activeSessions = getActiveSessions()

  useEffect(() => { if (step==='name') setTimeout(() => inputRef.current?.focus(), 80) }, [step])

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0,7)
  }, [query, members])

  function reset() { setStep('home'); setQuery(''); setSession(null); setSessState(null); setPerson(null); setStatus(null); setInj(''); setChecking(false); setMiCheck(null) }

  async function choosePerson(m) {
    setPerson(m); setChecking(true)
    await new Promise(r => setTimeout(r, 500))
    const miSt = getMiStatus(m)
    setMiCheck({ status:miSt, ...MI_STATUS_DISPLAY[miSt] })
    setChecking(false)
    if (openSessions.length===1) { setSession(openSessions[0]); setSessState(getSessionRegistrationState(openSessions[0])); setStep('status') }
    else if (openSessions.length>1) setStep('session')
    else setStep('closed')
  }

  async function chooseGuest() {
    const g = { name:query.trim(), isGuest:true, notMember:true }
    setPerson(g); setChecking(true)
    await new Promise(r => setTimeout(r, 400))
    setMiCheck({ status:'not_member', ...MI_STATUS_DISPLAY['not_member'] })
    setChecking(false)
    if (openSessions.length===1) { setSession(openSessions[0]); setSessState(getSessionRegistrationState(openSessions[0])); setStep('status') }
    else if (openSessions.length>1) setStep('session')
    else setStep('closed')
  }

  function pickSession(s) { setSession(s); setSessState(getSessionRegistrationState(s)); setStep('status') }

  function confirm() {
    const isLate = sessionState?.late && sessionState?.minsIn>0
    onAdd({ memberId:person.id||null, memberName:person.name, date:todayISO(), day:todayName(), session:session.name, disc:session.disc, status, isLate, lateMinutes:isLate?Math.max(0,Math.floor(sessionState.minsIn)):0, injuryNote:status==='strength'&&injuryNote.trim()?injuryNote.trim():null, registeredAt:nowHHMM(), miStatus:miCheck?.status||'not_member', isGuest:!!person.isGuest, isCoach:!!person.isCoach })
    setStep('done')
  }

  if (step==='home') return (
    <Screen center>
      <div style={{ marginBottom:20 }}><SpartacusLogo size={90} showText/></div>
      <div style={{ fontSize:15, fontWeight:800, letterSpacing:'0.18em', textTransform:'uppercase', color:'#ff4da6', marginBottom:28 }}>— Sterkere Sammen —</div>
      <div style={{ color:T.muted, fontSize:12, marginBottom:20 }}>{todayName()} · {nowHHMM()}</div>
      {openSessions.length>0 ? (
        <div style={{ width:'100%' }}>
          <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:10 }}>Registrering åpen nå</div>
          {openSessions.map(s => {
            const st = getSessionRegistrationState(s)
            return (
              <div key={s.name} style={{ marginBottom:8, padding:'12px 16px', borderRadius:12, background:`${T.accent}18`, border:`1px solid ${T.accent}55`, textAlign:'center' }}>
                <span style={{ fontWeight:800, color:T.accentL, fontSize:15 }}>{s.icon} {s.name}</span>
                <span style={{ color:T.muted, fontSize:12, marginLeft:8 }}>{s.start}–{s.end}</span>
                {st.late && st.minsIn<=LATE_CUTOFF_MINS && <div style={{ fontSize:11, color:T.orange, fontWeight:800, marginTop:4 }}>⏱ Sent · Stenger om {Math.ceil(LATE_CUTOFF_MINS-st.minsIn)} min</div>}
              </div>
            )
          })}
          <BigBtn onClick={() => setStep('name')} style={{ marginTop:14 }}>📋 REGISTRER OPPMØTE</BigBtn>
        </div>
      ) : (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:24, textAlign:'center', width:'100%' }}>
          <div style={{ fontSize:34, marginBottom:8 }}>🕐</div>
          <div style={{ fontWeight:700, marginBottom:6 }}>Ingen registrering åpen akkurat nå</div>
          <div style={{ color:T.muted, fontSize:13, marginBottom:4 }}>Åpner 30 min før – stenger {LATE_CUTOFF_MINS} min etter start</div>
          {activeSessions.filter(s => getSessionRegistrationState(s).reason==='closed_late').map(s => (
            <div key={s.name} style={{ marginTop:8, padding:'8px 12px', borderRadius:8, background:`${T.red}18`, border:`1px solid ${T.red}44`, fontSize:12, color:T.red }}>⛔ {s.icon} {s.name} — stengt</div>
          ))}
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:12 }}>
            {(SCHEDULE[todayName()]||[]).map(s => (
              <div key={s.name} style={{ padding:'8px 12px', borderRadius:8, background:T.surface, border:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span>{s.icon} {s.name}</span><span style={{ color:T.muted }}>{s.start}–{s.end}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Screen>
  )

  if (step==='closed') return (
    <Screen center>
      <BackBtn onClick={reset}/>
      <div style={{ fontSize:48, marginBottom:12 }}>⛔</div>
      <div style={{ fontWeight:900, fontSize:20, marginBottom:8, color:T.red }}>Registrering stengt</div>
      <div style={{ color:T.muted, fontSize:14, textAlign:'center', marginBottom:20 }}>Mer enn {LATE_CUTOFF_MINS} minutter er gått. Kontakt treneren.</div>
      <BigBtn onClick={reset} style={{ background:T.surface, border:`1px solid ${T.border}`, color:T.muted }}>← Tilbake</BigBtn>
    </Screen>
  )

  if (step==='name') return (
    <Screen>
      <BackBtn onClick={reset}/>
      <div style={{ marginBottom:18, textAlign:'center' }}><SpartacusLogo size={44} showText={false}/></div>
      <STitle>Hvem er du?</STitle>
      <input ref={inputRef} style={{ width:'100%', padding:'16px 18px', borderRadius:12, border:`2px solid ${T.accent}`, background:T.card, color:T.text, fontSize:20, outline:'none', boxSizing:'border-box', marginBottom:8 }} placeholder="Skriv navn…" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off"/>
      {filtered.length>0 && (
        <div style={{ width:'100%', background:T.card, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:8 }}>
          {filtered.map(m => {
            const miSt = getMiStatus(m); const d = MI_STATUS_DISPLAY[miSt]
            return (
              <button key={m.id} onClick={() => choosePerson(m)} style={{ width:'100%', padding:'13px 16px', background:'transparent', border:'none', borderBottom:`1px solid ${T.border}`, color:T.text, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:10, fontSize:15 }}>
                <Avatar name={m.name}/><span style={{ flex:1, fontWeight:700 }}>{m.name}</span>
                <span style={{ fontSize:11, color:T.muted }}>{m.disc}</span>
                {m.isCoach && <Tag c={T.gold}>TRENER</Tag>}
                <Tag c={d.color}>{d.label}</Tag>
              </button>
            )
          })}
        </div>
      )}
      {query.trim().length>=2 && filtered.length===0 && (
        <div style={{ width:'100%', background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px', color:T.muted, fontSize:14 }}>
          Ikke funnet — <button onClick={chooseGuest} style={{ background:'none', border:'none', color:T.gold, fontWeight:800, cursor:'pointer', fontSize:14 }}>Fortsett som gjest →</button>
        </div>
      )}
    </Screen>
  )

  if (step==='session') return (
    <Screen>
      <BackBtn onClick={() => setStep('name')}/>
      <STitle>Hvilken time?</STitle>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%' }}>
        {openSessions.map(s => {
          const st = getSessionRegistrationState(s)
          return (
            <button key={s.name} onClick={() => pickSession(s)} style={{ padding:'18px', borderRadius:14, border:`1px solid ${T.accent}55`, background:`${T.accent}15`, color:T.text, cursor:'pointer', textAlign:'left', display:'flex', gap:14, alignItems:'center' }}>
              <span style={{ fontSize:28 }}>{s.icon}</span>
              <div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:17 }}>{s.name}</div><div style={{ fontSize:12, color:T.muted }}>{s.start}–{s.end}</div></div>
              {st.late && <Tag c={T.orange}>SENT</Tag>}
            </button>
          )
        })}
      </div>
    </Screen>
  )

  if (step==='status') return (
    <Screen>
      <BackBtn onClick={() => openSessions.length>1?setStep('session'):setStep('name')}/>
      {checking && <div style={{ color:T.muted, marginBottom:12, fontSize:13 }}>🔍 Sjekker Min Idrett…</div>}
      {miCheck && !checking && <MiStatusBanner status={miCheck.status}/>}
      {sessionState?.late && sessionState?.minsIn>0 && (
        <div style={{ width:'100%', padding:'10px 14px', borderRadius:9, marginBottom:14, background:`${T.orange}18`, border:`1.5px solid ${T.orange}`, color:T.orange, fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>⏱</span>
          <div><div>Sent oppmøte – {Math.floor(sessionState.minsIn)} min etter start</div><div style={{ fontWeight:500, opacity:0.8, fontSize:11 }}>Registreres automatisk som sent</div></div>
        </div>
      )}
      <div style={{ width:'100%', padding:'9px 14px', borderRadius:9, marginBottom:20, background:`${T.accent}15`, border:`1px solid ${T.accent}44`, textAlign:'center', fontSize:13 }}>
        <span style={{ fontWeight:800, color:T.accentL }}>{session?.icon} {session?.name}</span>
        <span style={{ color:T.muted, marginLeft:8 }}>{session?.start}–{session?.end}</span>
      </div>
      <STitle>Hei, {person?.name.split(' ')[0]}! Velg status:</STitle>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', marginBottom:16 }}>
        {[
          { key:'attended', icon:'✅', label:'Deltar',            desc:'Fullt oppmøte',              color:T.green  },
          { key:'strength', icon:'💪', label:'Styrke/alternativ', desc:'Skade eller alternativ økt', color:T.yellow },
          { key:'absent',   icon:'❌', label:'Melder fravær',     desc:'Kan ikke møte i dag',        color:T.red    },
        ].map(opt => (
          <button key={opt.key} onClick={() => setStatus(opt.key)} style={{ padding:'16px 18px', borderRadius:13, border:`2px solid ${status===opt.key?opt.color:T.border}`, background:status===opt.key?`${opt.color}22`:T.card, color:T.text, cursor:'pointer', textAlign:'left', display:'flex', gap:14, alignItems:'center' }}>
            <span style={{ fontSize:26 }}>{opt.icon}</span>
            <div><div style={{ fontWeight:800, fontSize:16, color:status===opt.key?opt.color:T.text }}>{opt.label}</div><div style={{ fontSize:12, color:T.muted }}>{opt.desc}</div></div>
          </button>
        ))}
      </div>
      {status==='strength' && <input value={injuryNote} onChange={e => setInj(e.target.value)} placeholder="Skade / kommentar (valgfritt)…" style={{ width:'100%', padding:'12px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.card, color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:12 }}/>}
      {status && <BigBtn onClick={confirm}>BEKREFT →</BigBtn>}
    </Screen>
  )

  if (step==='done') return (
    <Screen center>
      <SpartacusLogo size={70} showText={false}/>
      <div style={{ fontSize:26, fontWeight:900, color:T.green, marginBottom:6, marginTop:12 }}>{status==='absent'?'Fravær registrert!':'God trening! 💪'}</div>
      <div style={{ color:T.muted, marginBottom:4 }}>{person?.name}</div>
      <div style={{ color:T.accent, fontWeight:700, marginBottom:4 }}>{session?.icon} {session?.name} · {session?.start}</div>
      {sessionState?.late && sessionState.minsIn>0 && status!=='absent' && <div style={{ color:T.orange, fontSize:12, fontWeight:800, marginBottom:8 }}>⏱ Registrert som sent ({Math.floor(sessionState.minsIn)} min)</div>}
      <div style={{ fontSize:13, fontWeight:800, color:'#ff4da6', letterSpacing:'0.12em', marginBottom:24 }}>— Sterkere Sammen —</div>
      <BigBtn onClick={reset}>← Neste person</BigBtn>
    </Screen>
  )

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleView() {
  const today = todayName(); const now = nowHHMM()
  return (
    <div style={{ padding:'16px 14px', maxWidth:680, margin:'0 auto' }}>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ background:T.accent, padding:'14px 18px', textAlign:'center' }}>
          <div style={{ fontWeight:900, fontSize:18, letterSpacing:2 }}>📅 SPARTACUS TIMEPLAN</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Registrering åpner 30 min før · stenger {LATE_CUTOFF_MINS} min etter start</div>
        </div>
        {DAYS_NO.map(day => {
          const isToday = day===today
          return (
            <div key={day} style={{ borderBottom:`1px solid ${T.border}`, opacity:isToday?1:0.5 }}>
              <div style={{ padding:'9px 16px', background:isToday?`${T.accent}22`:'transparent', display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontWeight:900, fontSize:12, color:isToday?T.accent:'#fff', textTransform:'uppercase', letterSpacing:1 }}>{day}</span>
                {isToday && <Tag c={T.accent}>I DAG</Tag>}
              </div>
              <div style={{ padding:'0 16px 10px', display:'flex', flexDirection:'column', gap:5 }}>
                {SCHEDULE[day].map(s => {
                  const st   = isToday ? getSessionRegistrationState(s, now) : null
                  const live = st?.open; const late = st?.late&&st?.open; const closed = st?.reason==='closed_late'
                  return (
                    <div key={s.name} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px', borderRadius:9, background:live?`${T.green}18`:closed?`${T.red}10`:T.surface, border:`1px solid ${live?T.green:closed?T.red:T.border}` }}>
                      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{s.icon}</span>
                      <div style={{ flex:1 }}><div style={{ fontWeight:800, color:live?T.green:closed?T.red:T.text, fontSize:13 }}>{s.name}</div>{s.desc&&<div style={{ fontSize:10, color:T.muted }}>{s.desc}</div>}</div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:11, color:T.muted, fontWeight:700 }}>{s.start}–{s.end}</div>
                        {live&&!late&&<div style={{ fontSize:10, color:T.green, fontWeight:800 }}>● ÅPEN</div>}
                        {live&&late &&<div style={{ fontSize:10, color:T.orange,fontWeight:800 }}>⏱ SENT</div>}
                        {closed     &&<div style={{ fontSize:10, color:T.red,   fontWeight:800 }}>⛔ STENGT</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({ members, setMembers, attendance, auth, setAuth, onEdit, onDelete, onSync, miStatus }) {
  const [tab, setTab]    = useState('overview')
  const [loginUser, setLU] = useState('')
  const [loginPass, setLP] = useState('')
  const [loginErr, setLE]  = useState('')

  const ADMINS = [{ username:'coach', password:'Spartacus#2023' }]

  function handleLogin() {
    const c = ADMINS.find(a => a.username.toLowerCase()===loginUser.toLowerCase().trim() && a.password===loginPass)
    if (c) { setAuth(true); setLE('') } else setLE('Feil brukernavn eller passord')
  }

  const miCounts = useMemo(() => {
    const counts = { active:0, expired:0, unpaid:0, not_member:0 }
    members.forEach(m => { const s=getMiStatus(m); counts[s]=(counts[s]||0)+1 })
    return counts
  }, [members])

  if (!auth) return (
    <Screen center>
      <SpartacusLogo size={56} showText/>
      <div style={{ marginTop:20, width:'100%' }}>
        <STitle>Admin-innlogging</STitle>
        <input placeholder="Brukernavn" value={loginUser} onChange={e => setLU(e.target.value)} style={inputSt} autoComplete="username"/>
        <input type="password" placeholder="Passord" value={loginPass} onChange={e => setLP(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleLogin()} style={{ ...inputSt, marginTop:8, marginBottom:12 }} autoComplete="current-password"/>
        {loginErr && <div style={{ color:T.red, fontSize:13, marginBottom:10 }}>{loginErr}</div>}
        <BigBtn onClick={handleLogin}>Logg inn</BigBtn>
        <div style={{ marginTop:10, color:T.muted, fontSize:11, textAlign:'center' }}>Demo: coach / Spartacus#2023</div>
      </div>
    </Screen>
  )

  const tabs = [
    { key:'overview',  label:'📊 Oversikt'  },
    { key:'members',   label:'👥 Utøvere'   },
    { key:'late',      label:'⏱ Seint'      },
    { key:'log',       label:'📋 Logg'      },
    { key:'sms',       label:'📱 SMS'       },
    { key:'betaling',  label:'💳 Betaling'  },
    { key:'faktura',   label:'🧾 Faktura'   },
    { key:'manage',    label:'⚙️ Administrer'},
  ]
  const syncColor = miStatus.status==='ok'?T.green:miStatus.status==='syncing'?T.yellow:T.muted

  return (
    <div style={{ padding:'14px', maxWidth:1000, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'8px 12px', borderRadius:9, border:`1px solid ${tab===t.key?T.accent:T.border}`, background:tab===t.key?T.accent:'transparent', color:tab===t.key?'#fff':T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${syncColor}55`, fontSize:11, color:syncColor, display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:syncColor }}/>
            Min Idrett · {miStatus.status==='ok'?`${miStatus.count}`:miStatus.status==='syncing'?'Synker…':'Ikke tilkoblet'}
          </div>
          <button onClick={() => setAuth(false)} style={{ padding:'7px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>Logg ut</button>
        </div>
      </div>
      <MiStatusBar counts={miCounts}/>
      {tab==='overview' && <OverviewTab  members={members} attendance={attendance}/>}
      {tab==='members'  && <MembersTab   members={members} attendance={attendance}/>}
      {tab==='late'     && <LateTab      attendance={attendance}/>}
      {tab==='log'      && <LogTab       attendance={attendance} onEdit={onEdit} onDelete={onDelete}/>}
      {tab==='sms'      && <SmsTab       members={members} attendance={attendance}/>}
      {tab==='betaling' && <BetalingTab  members={members}/>}
      {tab==='faktura'  && <FakturaTab   members={members}/>}
      {tab==='manage'   && <ManageTab    members={members} setMembers={setMembers} onSync={onSync} miStatus={miStatus}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ members, attendance }) {
  const [period, setPeriod] = useState(30)
  const cutoff   = daysAgo(period)
  const periodLog = attendance.filter(a => a.date>=cutoff)
  const todayLog  = attendance.filter(a => a.date===todayISO())
  const weekLog   = attendance.filter(a => a.date>=daysAgo(7))
  const athletes  = members.filter(m => !m.isCoach)
  const lateToday = todayLog.filter(a => a.isLate && a.status!=='absent')

  const stats = useMemo(() => athletes.map(m => {
    const logs = periodLog.filter(a => a.memberId===m.id)
    const att  = logs.filter(a => a.status!=='absent').length
    return { ...m, elig:calcEligibility(att,logs.length) }
  }), [athletes, periodLog])

  const kampklar = stats.filter(s => s.elig.label==='Kampklar').length
  const maaVurd  = stats.filter(s => s.elig.label==='Må vurderes').length
  const ikkeKamp = stats.filter(s => s.elig.label==='Ikke kampklar').length

  const weekBars = useMemo(() => Array.from({length:8},(_,i) => ({
    c: attendance.filter(a => a.date>=daysAgo((8-i)*7) && a.date<daysAgo((7-i)*7) && a.status!=='absent').length
  })), [attendance])
  const maxBar = Math.max(...weekBars.map(w=>w.c),1)

  const discStats = useMemo(() => {
    const map={}
    periodLog.filter(a=>a.status!=='absent').forEach(a=>{ map[a.disc]=(map[a.disc]||0)+1 })
    return Object.entries(map).sort((a,b)=>b[1]-a[1])
  }, [periodLog])
  const maxDisc = Math.max(...discStats.map(d=>d[1]),1)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ fontWeight:900, fontSize:16 }}>Kampklarhet & statistikk</div>
        <select value={period} onChange={e=>setPeriod(+e.target.value)} style={selSt}>
          <option value={7}>7 dager</option><option value={30}>30 dager</option>
          <option value={60}>60 dager</option><option value={90}>90 dager</option>
        </select>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:14 }}>
        {[
          {n:todayLog.length, l:'Innsjekk i dag',c:T.accent},
          {n:lateToday.length,l:'Sent i dag ⏱', c:T.orange},
          {n:weekLog.length,  l:'Oppmøte uka',  c:T.blue  },
          {n:kampklar,        l:'Kampklare 🟢', c:T.green },
          {n:maaVurd,         l:'Vurderes 🟡',  c:T.yellow},
          {n:ikkeKamp,        l:'Ikke klar 🔴', c:T.red   },
        ].map(({n,l,c}) => (
          <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', lineHeight:1.3 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>Oppmøte uke for uke</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:80 }}>
          {weekBars.map((w,i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
              <div style={{ width:'100%', background:`${T.accent}cc`, borderRadius:'4px 4px 0 0', height:`${(w.c/maxBar)*64}px`, minHeight:3 }}/>
              <span style={{ fontSize:9, color:T.muted }}>U{i+1}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>Popularitet per gren</div>
        {discStats.map(([disc,count]) => (
          <div key={disc} style={{ marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontWeight:700, fontSize:13 }}>{disc}</span><span style={{ fontSize:11, color:T.muted }}>{count}</span>
            </div>
            <div style={{ background:T.surface, borderRadius:5, height:7, overflow:'hidden' }}>
              <div style={{ width:`${(count/maxDisc)*100}%`, height:'100%', background:T.accent, borderRadius:5 }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMBERS
// ═══════════════════════════════════════════════════════════════════════════════
function MembersTab({ members, attendance }) {
  const [period, setPeriod] = useState(30)
  const [disc, setDisc]     = useState('Alle')
  const [search, setSrch]   = useState('')
  const [sortKey, setSK]    = useState('name')
  const [sortDir, setSD]    = useState(1)
  const athletes = members.filter(m => !m.isCoach)

  const stats = useMemo(() => athletes.map(m => {
    const all  = attendance.filter(a => a.memberId===m.id)
    const p    = all.filter(a => a.date>=daysAgo(period))
    const p90  = all.filter(a => a.date>=daysAgo(90))
    const att  = p.filter(a => a.status!=='absent').length
    const lateCount = p.filter(a => a.isLate&&a.status!=='absent').length
    return { ...m, e30:calcEligibility(att,p.length), e90:calcEligibility(p90.filter(a=>a.status!=='absent').length,p90.length), lateCount, miSt:getMiStatus(m) }
  }), [athletes, attendance, period])

  const filtered = useMemo(() => {
    let r = stats
    if (disc!=='Alle') r=r.filter(s=>s.disc===disc)
    if (search.trim()) r=r.filter(s=>s.name.toLowerCase().includes(search.toLowerCase()))
    return [...r].sort((a,b) => {
      if (sortKey==='name')  return a.name.localeCompare(b.name)*sortDir
      if (sortKey==='pct30') return ((a.e30.pct||0)-(b.e30.pct||0))*sortDir
      if (sortKey==='pct90') return ((a.e90.pct||0)-(b.e90.pct||0))*sortDir
      if (sortKey==='late')  return (a.lateCount-b.lateCount)*sortDir
      return 0
    })
  }, [stats, disc, search, sortKey, sortDir])

  function toggleSort(k) { if(sortKey===k) setSD(d=>d*-1); else { setSK(k); setSD(-1) } }
  const SH = ({k,label}) => <th onClick={()=>toggleSort(k)} style={{ padding:'10px 12px', textAlign:'left', color:sortKey===k?T.accent:T.muted, fontWeight:800, fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:`1px solid ${T.border}`, cursor:'pointer', whiteSpace:'nowrap' }}>{label}{sortKey===k?(sortDir===-1?' ▼':' ▲'):''}</th>

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
        <input placeholder="🔍 Søk…" value={search} onChange={e=>setSrch(e.target.value)} style={{ flex:1, minWidth:120, padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
        <select value={disc} onChange={e=>setDisc(e.target.value)} style={selSt}>{DISCIPLINES.map(d=><option key={d}>{d}</option>)}</select>
        <select value={period} onChange={e=>setPeriod(+e.target.value)} style={selSt}>
          <option value={7}>7d</option><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option>
        </select>
      </div>
      <div style={{ overflowX:'auto', borderRadius:14, border:`1px solid ${T.border}` }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead style={{ background:T.card }}>
            <tr>
              <SH k="name"  label="Navn"/>
              <th style={{ padding:'10px 12px', textAlign:'left', color:T.muted, fontWeight:800, fontSize:10, textTransform:'uppercase', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>Min Idrett</th>
              <th style={{ padding:'10px 12px', textAlign:'left', color:T.muted, fontWeight:800, fontSize:10, textTransform:'uppercase', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>Gren</th>
              <SH k="pct30" label={`${period}d %`}/>
              <SH k="pct90" label="90d %"/>
              <SH k="late"  label="Sent"/>
              <th style={{ padding:'10px 12px', textAlign:'left', color:T.muted, fontWeight:800, fontSize:10, textTransform:'uppercase', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>Kampstatus</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m,i) => {
              const d = MI_STATUS_DISPLAY[m.miSt]
              return (
                <tr key={m.id} style={{ background:i%2===0?T.card:T.surface }}>
                  <td style={{ padding:'11px 12px', fontWeight:700, borderBottom:`1px solid ${T.border}` }}><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={m.name} size={28}/>{m.name}</div></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><Tag c={d.color}>{d.label}</Tag></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><Tag c={T.blue}>{m.disc}</Tag></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><PctBar pct={m.e30.pct||0} color={m.e30.color}/></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><PctBar pct={m.e90.pct||0} color={m.e90.color}/></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><span style={{ color:m.lateCount>0?T.orange:T.muted, fontWeight:800, fontSize:13 }}>{m.lateCount>0?`⏱ ${m.lateCount}x`:'–'}</span></td>
                  <td style={{ padding:'11px 12px', borderBottom:`1px solid ${T.border}` }}><span style={{ padding:'4px 10px', borderRadius:99, background:m.e30.bg, color:m.e30.color, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>{m.e30.label} ({m.e30.pct}%)</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LATE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function LateTab({ attendance }) {
  const [period, setPeriod] = useState(30)
  const [search, setSrch]   = useState('')
  const cutoff = daysAgo(period)

  const lateRecords = useMemo(() =>
    attendance.filter(a=>a.isLate&&a.status!=='absent'&&a.date>=cutoff).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))
  , [attendance, cutoff])

  const filtered = useMemo(() => {
    if (!search.trim()) return lateRecords
    const q = search.toLowerCase()
    return lateRecords.filter(a=>a.memberName.toLowerCase().includes(q)||a.session.toLowerCase().includes(q))
  }, [lateRecords, search])

  const byPerson = useMemo(() => {
    const map={}
    lateRecords.forEach(a=>{ if(!map[a.memberName]) map[a.memberName]={name:a.memberName,count:0,totalMins:0}; map[a.memberName].count++; map[a.memberName].totalMins+=a.lateMinutes||0 })
    return Object.values(map).sort((a,b)=>b.count-a.count)
  }, [lateRecords])

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontWeight:900, fontSize:16 }}>⏱ Seint oppmøte</div>
        <div style={{ display:'flex', gap:8 }}>
          <input placeholder="🔍 Søk…" value={search} onChange={e=>setSrch(e.target.value)} style={{ padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', width:160 }}/>
          <select value={period} onChange={e=>setPeriod(+e.target.value)} style={selSt}>
            <option value={7}>7d</option><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option>
          </select>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, marginBottom:16 }}>
        {[
          {n:lateRecords.length, l:'Seint totalt',    c:T.orange},
          {n:byPerson.length,    l:'Unike utøvere',   c:T.yellow},
        ].map(({n,l,c}) => (
          <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:5, fontWeight:700, textTransform:'uppercase' }}>{l}</div>
          </div>
        ))}
        {byPerson[0] && (
          <div style={{ background:T.card, border:`1px solid ${T.orange}55`, borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:900, color:T.orange, lineHeight:1.2 }}>{byPerson[0].name.split(' ')[0]}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:5, fontWeight:700, textTransform:'uppercase' }}>Flest sene ({byPerson[0].count}x)</div>
          </div>
        )}
      </div>
      {byPerson.length>0 && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Oversikt per utøver</div>
          {byPerson.map(p => (
            <div key={p.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
              <Avatar name={p.name} size={28}/>
              <span style={{ flex:1, fontWeight:700, fontSize:13 }}>{p.name}</span>
              <span style={{ color:T.orange, fontWeight:800, fontSize:13 }}>⏱ {p.count}x</span>
              <span style={{ color:T.muted, fontSize:11 }}>snitt {p.count>0?Math.round(p.totalMins/p.count):0} min</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
        {filtered.length===0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen seint oppmøte i perioden</div>}
        {filtered.map((a,i) => (
          <div key={a.id} style={{ padding:'11px 14px', borderBottom:i<filtered.length-1?`1px solid ${T.border}`:'none', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <Avatar name={a.memberName} size={28}/>
            <div style={{ flex:1, minWidth:100 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{a.memberName}</div>
              <div style={{ fontSize:11, color:T.muted }}>{a.session} · {a.date} · {a.registeredAt}</div>
            </div>
            <Tag c={T.orange}>{a.lateMinutes||'?'}min sent</Tag>
            {a.status==='strength' && <Tag c={T.yellow}>Styrke</Tag>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG TAB
// ═══════════════════════════════════════════════════════════════════════════════
function LogTab({ attendance, onEdit, onDelete }) {
  const [editing, setEditing]    = useState(null)
  const [eStatus, setES]         = useState('attended')
  const [eNote, setEN]           = useState('')
  const [confirmDel, setConfirm] = useState(null)
  const [fDate, setFD]           = useState(todayISO())
  const [search, setSrch]        = useState('')

  const filtered = useMemo(() => {
    let r = attendance
    if (fDate)         r=r.filter(a=>a.date===fDate)
    if (search.trim()) r=r.filter(a=>a.memberName.toLowerCase().includes(search.toLowerCase())||a.session.toLowerCase().includes(search.toLowerCase()))
    return [...r].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)
  }, [attendance, fDate, search])

  const sColor = s => s==='attended'?T.green:s==='strength'?T.yellow:T.red
  const sLabel = s => s==='attended'?'Deltar':s==='strength'?'Styrke':'Fravær'

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
        <input type="date" value={fDate} onChange={e=>setFD(e.target.value)} style={{ padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
        <input placeholder="🔍 Navn / time…" value={search} onChange={e=>setSrch(e.target.value)} style={{ flex:1, minWidth:120, padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
        <button onClick={()=>setFD('')} style={{ padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>Vis alle</button>
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
        {filtered.length===0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen registreringer</div>}
        {filtered.map(a => {
          const miD = MI_STATUS_DISPLAY[a.miStatus||'active']||MI_STATUS_DISPLAY['not_member']
          return (
            <div key={a.id}>
              <div style={{ padding:'11px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <Avatar name={a.memberName} size={30}/>
                <div style={{ flex:1, minWidth:100 }}>
                  <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {a.memberName}<Tag c={miD.color}>{miD.label}</Tag>
                    {a.isLate && <Tag c={T.orange}>⏱ {a.lateMinutes||'?'}min</Tag>}
                  </div>
                  <div style={{ fontSize:11, color:T.muted }}>{a.session} · {a.date} {a.registeredAt}</div>
                  {a.injuryNote && <div style={{ fontSize:11, color:T.yellow }}>💬 {a.injuryNote}</div>}
                </div>
                <Tag c={sColor(a.status)}>{sLabel(a.status)}</Tag>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>{ setEditing(a.id); setES(a.status); setEN(a.injuryNote||''); setConfirm(null) }} style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer', fontSize:11 }}>✏️</button>
                  <button onClick={()=>{ setConfirm(a.id); setEditing(null) }} style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.red, cursor:'pointer', fontSize:11 }}>🗑</button>
                </div>
              </div>
              {editing===a.id && (
                <div style={{ padding:'12px 14px', background:`${T.accent}10`, borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <select value={eStatus} onChange={e=>setES(e.target.value)} style={{ padding:'7px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}>
                    <option value="attended">Deltar</option><option value="strength">Styrke</option><option value="absent">Fravær</option>
                  </select>
                  <input value={eNote} onChange={e=>setEN(e.target.value)} placeholder="Kommentar…" style={{ flex:1, minWidth:100, padding:'7px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
                  <button onClick={()=>{ onEdit(a.id,{status:eStatus,injuryNote:eNote||null}); setEditing(null) }} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:T.green, color:'#fff', fontWeight:800, cursor:'pointer' }}>Lagre</button>
                  <button onClick={()=>setEditing(null)} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer' }}>Avbryt</button>
                </div>
              )}
              {confirmDel===a.id && (
                <div style={{ padding:'10px 14px', background:`${T.red}18`, borderBottom:`1px solid ${T.border}`, display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ flex:1, fontSize:13, color:T.red, fontWeight:700 }}>Slett denne registreringen?</span>
                  <button onClick={()=>{ onDelete(a.id); setConfirm(null) }} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:T.red, color:'#fff', fontWeight:800, cursor:'pointer', fontSize:12 }}>Slett</button>
                  <button onClick={()=>setConfirm(null)} style={{ padding:'6px 14px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>Avbryt</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function SmsTab({ members, attendance }) {
  const [period, setPeriod]    = useState(30)
  const [threshold, setThresh] = useState(80)
  const [msgTemplate, setMsg]  = useState('Hei {navn}! 🏆 Du har oppnådd {prosent}% oppmøte på Spartacus ({periode} dager). Fantastisk innsats – du er kampklar! 💪 – Coach Dale / Spartacus')
  const [sent, setSent]        = useState([])
  const [preview, setPreview]  = useState(null)
  const [sending, setSending]  = useState(false)
  const [smsLog, setSmsLog]    = useState([])

  const cutoff = daysAgo(period)
  const eligible = useMemo(() =>
    members.filter(m=>!m.isCoach).map(m => {
      const logs = attendance.filter(a=>a.memberId===m.id&&a.date>=cutoff&&WEEKDAYS_SMS.includes(a.day))
      const att  = logs.filter(a=>a.status!=='absent').length
      const elig = calcEligibility(att,logs.length)
      return { ...m, elig, sessions:logs.length }
    }).filter(m=>m.elig.pct>=threshold).sort((a,b)=>b.elig.pct-a.elig.pct)
  , [members, attendance, period, threshold])

  const alreadySent = useMemo(() => new Set(sent.map(s=>s.id)), [sent])

  function buildMessage(m) { return msgTemplate.replace('{navn}',m.name.split(' ')[0]).replace('{prosent}',m.elig.pct).replace('{periode}',period) }

  async function sendAll() {
    setSending(true)
    for (const m of eligible.filter(m=>!alreadySent.has(m.id))) {
      await new Promise(r=>setTimeout(r,200))
      const e = { id:m.id, name:m.name, phone:m.phone||'Ukjent', pct:m.elig.pct, msg:buildMessage(m), sentAt:new Date().toLocaleString('nb-NO') }
      setSent(p=>[...p,e]); setSmsLog(p=>[e,...p])
    }
    setSending(false)
  }

  async function sendOne(m) {
    if (alreadySent.has(m.id)) return
    await new Promise(r=>setTimeout(r,200))
    const e = { id:m.id, name:m.name, phone:m.phone||'Ukjent', pct:m.elig.pct, msg:buildMessage(m), sentAt:new Date().toLocaleString('nb-NO') }
    setSent(p=>[...p,e]); setSmsLog(p=>[e,...p])
  }

  const unsent = eligible.filter(m=>!alreadySent.has(m.id))

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div><div style={{ fontWeight:900, fontSize:16, marginBottom:2 }}>📱 Automatisk SMS – Kampklar</div><div style={{ fontSize:12, color:T.muted }}>Kun søn–fre teller iht. regelverket</div></div>
        <div style={{ display:'flex', gap:6 }}>
          <select value={period} onChange={e=>setPeriod(+e.target.value)} style={selSt}>
            <option value={7}>7d</option><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option>
          </select>
          <select value={threshold} onChange={e=>setThresh(+e.target.value)} style={selSt}>
            <option value={70}>≥ 70%</option><option value={80}>≥ 80%</option><option value={85}>≥ 85%</option><option value={90}>≥ 90%</option>
          </select>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:16 }}>
        {[{n:eligible.length,l:`≥ ${threshold}%`,c:T.green},{n:unsent.length,l:'Klar til send',c:T.accent},{n:alreadySent.size,l:'Sendt',c:T.blue}].map(({n,l,c})=>(
          <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
            <div style={{ fontSize:10, color:T.muted, marginTop:5, fontWeight:700, textTransform:'uppercase' }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:16 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>✏️ SMS-mal</div>
        <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>Variabler: <code style={{ background:T.surface, padding:'1px 5px', borderRadius:4 }}>{'{navn}'}</code> <code style={{ background:T.surface, padding:'1px 5px', borderRadius:4 }}>{'{prosent}'}</code> <code style={{ background:T.surface, padding:'1px 5px', borderRadius:4 }}>{'{periode}'}</code></div>
        <textarea value={msgTemplate} onChange={e=>setMsg(e.target.value)} rows={3} style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', marginBottom:16 }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:13 }}>Mottakerliste ({eligible.length})</div>
          {unsent.length>0 && <button onClick={sendAll} disabled={sending} style={{ padding:'8px 18px', borderRadius:9, border:'none', background:sending?T.dim:T.accent, color:'#fff', fontWeight:800, cursor:sending?'not-allowed':'pointer', fontSize:13 }}>{sending?'Sender…':`📤 Send alle (${unsent.length})`}</button>}
        </div>
        {eligible.length===0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen har nådd {threshold}% i perioden</div>}
        {eligible.map(m => {
          const isSent = alreadySent.has(m.id)
          return (
            <div key={m.id} style={{ padding:'11px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <Avatar name={m.name} size={30}/>
              <div style={{ flex:1, minWidth:100 }}><div style={{ fontWeight:700, fontSize:13 }}>{m.name}</div><div style={{ fontSize:11, color:T.muted }}>{m.phone||'Ingen telefon'} · {m.sessions} timer</div></div>
              <span style={{ padding:'4px 10px', borderRadius:99, background:m.elig.bg, color:m.elig.color, fontSize:11, fontWeight:800 }}>{m.elig.pct}%</span>
              {isSent ? <Tag c={T.green}>✓ Sendt</Tag> : <button onClick={()=>setPreview(m)} style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${T.accent}55`, background:`${T.accent}15`, color:T.accentL, cursor:'pointer', fontSize:11, fontWeight:800 }}>Forhåndsvis</button>}
            </div>
          )
        })}
      </div>
      {smsLog.length>0 && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, fontWeight:800, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>📋 SMS-logg</span><Tag c={T.green}>{smsLog.length} sendt</Tag></div>
          {smsLog.map((s,i) => (
            <div key={s.id+i} style={{ padding:'10px 16px', borderBottom:i<smsLog.length-1?`1px solid ${T.border}`:'none', display:'flex', gap:10, alignItems:'flex-start' }}>
              <Avatar name={s.name} size={26}/>
              <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:12 }}>{s.name} <span style={{ color:T.muted, fontWeight:400 }}>· {s.phone}</span></div><div style={{ fontSize:11, color:T.muted, fontStyle:'italic', marginTop:2 }}>"{s.msg.slice(0,80)}{s.msg.length>80?'…':''}"</div></div>
              <div style={{ textAlign:'right', flexShrink:0 }}><Tag c={T.green}>✓</Tag><div style={{ fontSize:10, color:T.muted, marginTop:4 }}>{s.sentAt}</div></div>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:20, padding:24, maxWidth:440, width:'100%' }}>
            <div style={{ fontWeight:900, fontSize:16, marginBottom:14 }}>📱 Forhåndsvis SMS</div>
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, padding:'10px 14px', borderRadius:12, background:T.surface }}>
              <Avatar name={preview.name} size={36}/>
              <div><div style={{ fontWeight:800 }}>{preview.name}</div><div style={{ fontSize:12, color:T.muted }}>{preview.phone||'Ukjent nummer'} · {preview.elig.pct}%</div></div>
            </div>
            <div style={{ background:'#1a2a1a', border:`1px solid ${T.green}33`, borderRadius:12, padding:'14px 16px', fontSize:14, lineHeight:1.6, color:'#c8e6c9', fontFamily:'monospace', marginBottom:20, whiteSpace:'pre-wrap' }}>{buildMessage(preview)}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ sendOne(preview); setPreview(null) }} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:T.accent, color:'#fff', fontWeight:900, fontSize:14, cursor:'pointer' }}>📤 Send nå</button>
              <button onClick={()=>setPreview(null)} style={{ padding:'12px 20px', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, cursor:'pointer' }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// BETALING TAB
// ═══════════════════════════════════════════════════════════════════════════════
function BetalingTab({ members }) {
  const [provider, setProvider] = useState(null)
  const [subStep, setSubStep]   = useState('choose')
  const [product, setProduct]   = useState(PAYMENT_PRODUCTS[0])
  const [customAmt, setCustomAmt] = useState('')
  const [sendMethod, setSendMethod] = useState('sms')
  const [selectedMembers, setSelM]  = useState([])
  const [searchQ, setSearchQ]   = useState('')
  const [sentRequests, setSent] = useState([])
  const [sending, setSending]   = useState(false)
  const [vippsNum, setVippsNum] = useState('')
  const [vippsMSN, setVippsMSN] = useState('')
  const [izEmail, setIzEmail]   = useState('')

  const finalAmount = customAmt ? parseInt(customAmt) : product.amount
  const athletes = members.filter(m => !m.isCoach)
  const filteredM = athletes.filter(m => !searchQ.trim()||m.name.toLowerCase().includes(searchQ.toLowerCase()))

  function toggleMember(id) { setSelM(p => p.includes(id)?p.filter(x=>x!==id):[...p,id]) }

  async function sendRequests() {
    setSending(true)
    await new Promise(r=>setTimeout(r,800))
    const now = new Date().toLocaleString('nb-NO')
    setSent(p => [...athletes.filter(m=>selectedMembers.includes(m.id)).map(m => ({ id:`pay_${Date.now()}_${m.id}`, name:m.name, contact:sendMethod==='sms'?(m.phone||'Ukjent'):'epost@eksempel.no', method:sendMethod, amount:finalAmount, product:product.label, provider, status:'sendt', sentAt:now })), ...p])
    setSelM([]); setSubStep('done'); setSending(false)
  }

  if (subStep==='choose') return (
    <div>
      <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>💳 Betaling & fakturering</div>
      <div style={{ color:T.muted, fontSize:13, marginBottom:20 }}>Send betalingsforespørsel til utøvere. Velg løsning:</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:24 }}>
        {[
          { key:'vipps',   label:'Vipps',           color:'#ff5b24', logo:'🧡', desc:'Send betalingslenke på SMS. Betales i Vipps-appen.', badge:'🇳🇴 Mest brukt' },
          { key:'izettle', label:'Zettle (iZettle)', color:'#009b77', logo:'💚', desc:'Send faktura på e-post. Betales med kort.', badge:'💳 Kort & faktura' },
        ].map(opt => (
          <button key={opt.key} onClick={()=>{ setProvider(opt.key); setSubStep('setup') }} style={{ padding:'24px 16px', borderRadius:18, border:`2px solid ${T.border}`, background:T.card, cursor:'pointer', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div style={{ width:56, height:56, borderRadius:16, background:opt.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>{opt.logo}</div>
            <div style={{ fontWeight:900, fontSize:16, color:opt.color }}>{opt.label}</div>
            <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{opt.desc}</div>
            <div style={{ padding:'5px 12px', borderRadius:99, background:`${opt.color}22`, color:opt.color, fontSize:11, fontWeight:800 }}>{opt.badge}</div>
          </button>
        ))}
      </div>
      {sentRequests.length>0 && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, fontWeight:800, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>Siste betalinger</span><Tag c={T.green}>{sentRequests.length} sendt</Tag></div>
          {sentRequests.slice(0,8).map((r,i) => (
            <div key={r.id} style={{ padding:'10px 16px', borderBottom:i<Math.min(sentRequests.length,8)-1?`1px solid ${T.border}`:'none', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <Avatar name={r.name} size={28}/><div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:12 }}>{r.name}</div><div style={{ fontSize:11, color:T.muted }}>{r.product}</div></div>
              <span style={{ fontWeight:900, color:T.green, fontSize:13 }}>{r.amount} kr</span><Tag c={T.green}>✓</Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (subStep==='setup') {
    const isVipps = provider==='vipps'; const color = isVipps?'#ff5b24':'#009b77'
    return (
      <div>
        <BackBtn onClick={()=>setSubStep('choose')}/>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{isVipps?'🧡':'💚'}</div>
          <div><div style={{ fontWeight:900, fontSize:18, color }}>{isVipps?'Vipps oppsett':'Zettle oppsett'}</div><div style={{ fontSize:12, color:T.muted }}>Tar ca. 5 minutter</div></div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {(isVipps?[
            {n:1,t:'Last ned Vipps-appen',d:'App Store eller Google Play → søk «Vipps»'},
            {n:2,t:'Lag bedriftskonto',d:'vipps.no → «For bedrifter» → fyll inn org.nummer'},
            {n:3,t:'Skriv inn detaljer',d:'Vipps-nummer og MSN-nummer fra Vipps-portalen'},
            {n:4,t:'Klar!',d:'Send betalingslenker direkte på SMS'},
          ]:[
            {n:1,t:'Lag Zettle-konto',d:'zettle.com/no → «Kom i gang gratis»'},
            {n:2,t:'Koble til bankkonto',d:'Innstillinger → Utbetalinger → legg til kontonr'},
            {n:3,t:'Skriv inn e-post',d:'E-posten du bruker på Zettle'},
            {n:4,t:'Klar!',d:'Utøvere får profesjonell faktura på e-post'},
          ]).map((s,i) => (
            <div key={s.n} style={{ padding:'16px 18px', borderRadius:14, background:T.card, border:`1px solid ${T.border}`, display:'flex', gap:14, alignItems:'flex-start' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:`${color}22`, border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color, fontSize:16, flexShrink:0 }}>{s.n}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>{s.t}</div>
                <div style={{ fontSize:13, color:T.muted }}>{s.d}</div>
                {i===2 && isVipps && (
                  <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <input value={vippsNum} onChange={e=>setVippsNum(e.target.value)} placeholder="Vipps-nummer" style={{ flex:1, minWidth:130, padding:'9px 12px', borderRadius:9, border:`2px solid ${vippsNum?color:T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
                    <input value={vippsMSN} onChange={e=>setVippsMSN(e.target.value)} placeholder="MSN-nummer" style={{ flex:1, minWidth:100, padding:'9px 12px', borderRadius:9, border:`2px solid ${vippsMSN?color:T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
                  </div>
                )}
                {i===2 && !isVipps && <input value={izEmail} onChange={e=>setIzEmail(e.target.value)} placeholder="E-post til Zettle-kontoen" style={{ marginTop:10, width:'100%', padding:'9px 12px', borderRadius:9, border:`2px solid ${izEmail?color:T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', boxSizing:'border-box' }}/>}
              </div>
            </div>
          ))}
        </div>
        <button onClick={()=>setSubStep('send')} disabled={isVipps?(!vippsNum||!vippsMSN):!izEmail} style={{ width:'100%', padding:'16px', borderRadius:13, border:'none', background:(isVipps?(!vippsNum||!vippsMSN):!izEmail)?T.dim:color, color:'#fff', fontWeight:900, fontSize:16, cursor:'pointer', opacity:(isVipps?(!vippsNum||!vippsMSN):!izEmail)?0.5:1 }}>
          ✅ Ferdig – send betaling →
        </button>
      </div>
    )
  }

  if (subStep==='send') {
    const isVipps = provider==='vipps'; const color = isVipps?'#ff5b24':'#009b77'
    return (
      <div>
        <BackBtn onClick={()=>setSubStep('setup')}/>
        <div style={{ fontWeight:900, fontSize:16, marginBottom:16 }}>📤 Send betalingsforespørsel</div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:10 }}>1️⃣ Hva skal betales?</div>
          {PAYMENT_PRODUCTS.map(p => (
            <button key={p.id} onClick={()=>{ setProduct(p); setCustomAmt('') }} style={{ width:'100%', marginBottom:6, padding:'11px 14px', borderRadius:11, border:`2px solid ${product.id===p.id?color:T.border}`, background:product.id===p.id?`${color}15`:T.surface, color:T.text, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:20 }}>{p.icon}</span><span style={{ flex:1, fontWeight:700, fontSize:13, textAlign:'left' }}>{p.label}</span><span style={{ fontWeight:900, color:product.id===p.id?color:T.muted }}>{p.amount} kr</span>
            </button>
          ))}
          <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, color:T.muted }}>Eget beløp:</span>
            <input type="number" value={customAmt} onChange={e=>setCustomAmt(e.target.value)} placeholder="kr…" style={{ flex:1, padding:'9px 12px', borderRadius:9, border:`2px solid ${customAmt?color:T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none' }}/>
            <span style={{ fontWeight:900, color, fontSize:16 }}>{finalAmount} kr</span>
          </div>
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:10 }}>2️⃣ Send via</div>
          <div style={{ display:'flex', gap:8 }}>
            {[{k:'sms',icon:'📱',label:'SMS'},{k:'email',icon:'📧',label:'E-post'}].map(m => (
              <button key={m.k} onClick={()=>setSendMethod(m.k)} style={{ flex:1, padding:'12px', borderRadius:11, border:`2px solid ${sendMethod===m.k?color:T.border}`, background:sendMethod===m.k?`${color}15`:T.surface, color:T.text, cursor:'pointer', fontWeight:800, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span>{m.icon}</span><span>{m.label}</span></button>
            ))}
          </div>
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:10 }}>3️⃣ Hvem skal betale?</div>
          <input placeholder="🔍 Søk…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{ width:'100%', padding:'9px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:10 }}/>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <button onClick={()=>setSelM(athletes.map(m=>m.id))} style={{ background:'none', border:'none', color, cursor:'pointer', fontSize:12, fontWeight:800 }}>Velg alle</button>
            <button onClick={()=>setSelM([])} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:12 }}>Fjern alle</button>
          </div>
          <div style={{ maxHeight:220, overflowY:'auto', display:'flex', flexDirection:'column', gap:5 }}>
            {filteredM.map(m => {
              const sel = selectedMembers.includes(m.id)
              return (
                <button key={m.id} onClick={()=>toggleMember(m.id)} style={{ padding:'10px 12px', borderRadius:10, border:`2px solid ${sel?color:T.border}`, background:sel?`${color}15`:T.surface, color:T.text, cursor:'pointer', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                  <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${sel?color:T.dim}`, background:sel?color:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>{sel&&<span style={{ color:'#fff', fontSize:12, fontWeight:900 }}>✓</span>}</div>
                  <Avatar name={m.name} size={26}/>
                  <span style={{ flex:1, fontWeight:700, fontSize:13 }}>{m.name}</span>
                </button>
              )
            })}
          </div>
        </div>
        <button onClick={sendRequests} disabled={selectedMembers.length===0||sending} style={{ width:'100%', padding:'17px', borderRadius:13, border:'none', background:selectedMembers.length===0?T.dim:color, color:'#fff', fontWeight:900, fontSize:16, cursor:selectedMembers.length===0?'not-allowed':'pointer', opacity:selectedMembers.length===0?0.5:1 }}>
          {sending?'Sender…':`📤 Send til ${selectedMembers.length} utøver${selectedMembers.length!==1?'e':''} (${finalAmount} kr)`}
        </button>
      </div>
    )
  }

  if (subStep==='done') {
    const color = provider==='vipps'?'#ff5b24':'#009b77'
    return (
      <div style={{ textAlign:'center', padding:'32px 16px' }}>
        <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
        <div style={{ fontWeight:900, fontSize:22, color, marginBottom:8 }}>Betalingsforespørsler sendt!</div>
        <div style={{ color:T.muted, fontSize:14, marginBottom:24 }}>Utøverne har mottatt betaling via {provider==='vipps'?'Vipps':'Zettle'}.</div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>setSubStep('send')} style={{ flex:1, padding:'13px', borderRadius:12, border:`1px solid ${color}`, background:`${color}18`, color, fontWeight:800, cursor:'pointer', fontSize:14 }}>+ Send flere</button>
          <button onClick={()=>setSubStep('choose')} style={{ flex:1, padding:'13px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:800, cursor:'pointer', fontSize:14 }}>← Oversikt</button>
        </div>
      </div>
    )
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAKTURA TAB
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY_LINJE = () => ({ id:Date.now()+Math.random(), beskrivelse:'', antall:1, enhet:'stk', pris:'' })

function FakturaTab({ members }) {
  const [step, setStep]           = useState('liste')
  const [fakturaer, setFakturaer] = useState([])
  const [intStep, setIntStep]     = useState(null)
  const [fakturaNr]               = useState(genFakturaNr)
  const [mottaker, setMottaker]   = useState('member')
  const [valgtMedlem, setValgtM]  = useState('')
  const [fritekstNavn, setFTNavn] = useState('')
  const [fritekstEpost, setFTEpost] = useState('')
  const [fritekstAdresse, setFTAdr] = useState('')
  const [linjer, setLinjer]       = useState([EMPTY_LINJE()])
  const [forfall, setForfall]     = useState(() => { const d=new Date(); d.setDate(d.getDate()+14); return d.toISOString().split('T')[0] })
  const [notat, setNotat]         = useState('')
  const [intValg, setIntValg]     = useState('pdf')
  const [sendLoading, setSendLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('alle')
  const [searchQ, setSQ]          = useState('')

  const athletes = members.filter(m => !m.isCoach)

  function oppdaterLinje(id, felt, val) { setLinjer(p => p.map(l => l.id===id?{...l,[felt]:val}:l)) }
  function leggTilLinje() { setLinjer(p => [...p, EMPTY_LINJE()]) }
  function fjernLinje(id) { setLinjer(p => p.filter(l => l.id!==id)) }

  const subtotal = linjer.reduce((s,l) => s+(parseFloat(l.pris)||0)*(parseInt(l.antall)||0), 0)
  const mva      = Math.round(subtotal*0.25)
  const total    = subtotal + mva

  function getMottakerNavn() { return mottaker==='member' ? athletes.find(m=>m.id===valgtMedlem)?.name||'' : fritekstNavn }

  function sendFaktura() {
    setSendLoading(true)
    setTimeout(() => {
      setFakturaer(p => [{ id:fakturaNr, mottaker:getMottakerNavn(), epost:mottaker==='fritekst'?fritekstEpost:'', linjer:linjer.filter(l=>l.beskrivelse.trim()), subtotal, mva, total, forfall, notat, integrert:intValg, dato:todayISO(), status:'sendt' }, ...p])
      setStep('sendt'); setSendLoading(false)
    }, 900)
  }

  function resetSkjema() { setMottaker('member'); setValgtM(''); setFTNavn(''); setFTEpost(''); setFTAdr(''); setLinjer([EMPTY_LINJE()]); setNotat(''); setIntValg('pdf'); }

  if (step==='liste') {
    const visF = fakturaer.filter(f => {
      if (filterStatus!=='alle' && f.status!==filterStatus) return false
      if (searchQ.trim() && !f.mottaker.toLowerCase().includes(searchQ.toLowerCase()) && !f.id.includes(searchQ)) return false
      return true
    })
    const totalSendt = fakturaer.filter(f=>f.status==='sendt').reduce((s,f)=>s+f.total,0)

    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div><div style={{ fontWeight:900, fontSize:18 }}>🧾 Faktura</div><div style={{ color:T.muted, fontSize:13 }}>Lag faktura på hva som helst – utstyr, tøy, leie, kurs og mer</div></div>
          <button onClick={()=>{ resetSkjema(); setStep('ny') }} style={{ padding:'12px 22px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer' }}>+ Ny faktura</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, marginBottom:16 }}>
          {[{n:fakturaer.length,l:'Totalt sendt',c:T.blue},{n:fakturaer.filter(f=>f.status==='sendt').length,l:'Venter betaling',c:T.yellow},{n:`${totalSendt.toLocaleString('nb-NO')} kr`,l:'Sum utestående',c:T.green}].map(({n,l,c})=>(
            <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
              <div style={{ fontSize:10, color:T.muted, marginTop:5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', lineHeight:1.3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <input placeholder="🔍 Søk faktura / mottaker…" value={searchQ} onChange={e=>setSQ(e.target.value)} style={{ flex:1, minWidth:140, padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
          {['alle','sendt','betalt','kansellert'].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)} style={{ padding:'7px 13px', borderRadius:9, border:`1px solid ${filterStatus===s?T.accent:T.border}`, background:filterStatus===s?T.accent:'transparent', color:filterStatus===s?'#fff':T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>{s==='alle'?'Alle':s==='sendt'?'Sendt':s==='betalt'?'Betalt':'Kansellert'}</button>
          ))}
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>🔌 Koble til regnskapssystem</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {INTEGRASJONER.filter(i=>i.key!=='pdf').map(i=>(
              <button key={i.key} onClick={()=>setIntStep(i.key)} style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${intStep===i.key?i.color:T.border}`, background:intStep===i.key?`${i.color}22`:'transparent', color:intStep===i.key?i.color:T.muted, cursor:'pointer', fontSize:12, fontWeight:800, display:'flex', alignItems:'center', gap:6 }}>
                <span>{i.logo}</span>{i.label}{intStep===i.key&&<span style={{ color:T.green, fontSize:11 }}>✓</span>}
              </button>
            ))}
          </div>
          {intStep && <div style={{ marginTop:12, padding:'12px 14px', borderRadius:10, background:T.surface, border:`1px solid ${INTEGRASJONER.find(i=>i.key===intStep)?.color}44`, fontSize:13, color:T.muted, display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:20 }}>{INTEGRASJONER.find(i=>i.key===intStep)?.logo}</span><div><span style={{ color:T.text, fontWeight:800 }}>{INTEGRASJONER.find(i=>i.key===intStep)?.label}</span> er koblet til (demo). Fakturaer eksporteres automatisk.</div></div>}
        </div>
        {visF.length===0 ? (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:40, textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🧾</div>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>Ingen fakturaer ennå</div>
            <div style={{ color:T.muted, fontSize:14, marginBottom:20 }}>Lag din første faktura på utstyr, tøy, leie eller hva som helst!</div>
            <button onClick={()=>{ resetSkjema(); setStep('ny') }} style={{ padding:'12px 28px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:900, fontSize:15, cursor:'pointer' }}>+ Lag faktura nå</button>
          </div>
        ) : (
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
            {visF.map((f,i)=>(
              <div key={f.id} style={{ padding:'14px 16px', borderBottom:i<visF.length-1?`1px solid ${T.border}`:'none', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${T.accent}22`, border:`1px solid ${T.accent}55`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:14, color:T.accent, flexShrink:0 }}>🧾</div>
                <div style={{ flex:1, minWidth:100 }}><div style={{ fontWeight:800, fontSize:14 }}>{f.mottaker}</div><div style={{ fontSize:11, color:T.muted }}>{f.id} · {f.dato} · Forfall {f.forfall}</div></div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontWeight:900, fontSize:16, color:T.green }}>{f.total.toLocaleString('nb-NO')} kr</span>
                  <Tag c={f.status==='betalt'?T.green:f.status==='kansellert'?T.red:T.yellow}>{f.status==='betalt'?'✓ Betalt':f.status==='kansellert'?'Kansellert':'Sendt'}</Tag>
                  <Tag c={INTEGRASJONER.find(x=>x.key===f.integrert)?.color||T.muted}>{INTEGRASJONER.find(x=>x.key===f.integrert)?.label||'PDF'}</Tag>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  <button onClick={()=>setFakturaer(p=>p.map(x=>x.id===f.id?{...x,status:'betalt'}:x))} disabled={f.status==='betalt'} style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${T.green}55`, background:`${T.green}15`, color:T.green, cursor:f.status==='betalt'?'not-allowed':'pointer', fontSize:11, fontWeight:800, opacity:f.status==='betalt'?0.4:1 }}>Betalt</button>
                  <button onClick={()=>setFakturaer(p=>p.filter(x=>x.id!==f.id))} style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.red, cursor:'pointer', fontSize:11 }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (step==='ny') {
    return (
      <div>
        <BackBtn onClick={()=>setStep('liste')}/>
        <div style={{ fontWeight:900, fontSize:18, marginBottom:2 }}>🧾 Ny faktura</div>
        <div style={{ color:T.muted, fontSize:13, marginBottom:18 }}>Fakturanr: <strong style={{ color:T.accent }}>{fakturaNr}</strong></div>

        {/* Steg 1 */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:26, height:26, borderRadius:'50%', background:T.accent, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0 }}>1</span>
            Hvem er fakturaen til?
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            {[{k:'member',l:'👤 Velg fra liste'},{k:'fritekst',l:'✏️ Skriv inn selv'}].map(opt=>(
              <button key={opt.k} onClick={()=>setMottaker(opt.k)} style={{ flex:1, padding:'11px', borderRadius:10, border:`2px solid ${mottaker===opt.k?T.accent:T.border}`, background:mottaker===opt.k?`${T.accent}15`:T.surface, color:T.text, cursor:'pointer', fontWeight:800, fontSize:13 }}>{opt.l}</button>
            ))}
          </div>
          {mottaker==='member' ? (
            <select value={valgtMedlem} onChange={e=>setValgtM(e.target.value)} style={{ width:'100%', padding:'13px 14px', borderRadius:10, border:`2px solid ${valgtMedlem?T.accent:T.border}`, background:T.surface, color:valgtMedlem?T.text:T.muted, fontSize:15, outline:'none' }}>
              <option value="">– Velg utøver –</option>
              {athletes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <input placeholder="Fullt navn *" value={fritekstNavn} onChange={e=>setFTNavn(e.target.value)} style={{ padding:'12px 14px', borderRadius:10, border:`2px solid ${fritekstNavn?T.accent:T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none' }}/>
              <input placeholder="E-postadresse" value={fritekstEpost} onChange={e=>setFTEpost(e.target.value)} style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none' }}/>
              <input placeholder="Adresse (valgfritt)" value={fritekstAdresse} onChange={e=>setFTAdr(e.target.value)} style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none' }}/>
            </div>
          )}
        </div>

        {/* Steg 2 – Linjer */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:26, height:26, borderRadius:'50%', background:T.accent, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0 }}>2</span>
            Hva skal faktureres?
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Hurtigvalg:</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {FAKTURA_KATEGORIER.map(k=>(
                <button key={k} onClick={()=>setLinjer(p=>[...p.filter(l=>l.beskrivelse||l.pris),{id:Date.now()+Math.random(),beskrivelse:k,antall:1,enhet:'stk',pris:''}])} style={{ padding:'6px 12px', borderRadius:99, border:`1px solid ${T.border}`, background:T.surface, color:T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>+ {k}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                  {['Beskrivelse','Antall','Enhet','Pris (kr)','Sum',''].map(h=>(
                    <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:T.muted, fontWeight:800, fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linjer.map(l => {
                  const sum = (parseFloat(l.pris)||0)*(parseInt(l.antall)||0)
                  return (
                    <tr key={l.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'6px 8px' }}><input value={l.beskrivelse} onChange={e=>oppdaterLinje(l.id,'beskrivelse',e.target.value)} placeholder="F.eks. Boksehansker 10oz…" style={{ width:'100%', minWidth:130, padding:'8px 10px', borderRadius:8, border:`1px solid ${l.beskrivelse?T.accent:T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', boxSizing:'border-box' }}/></td>
                      <td style={{ padding:'6px 8px' }}><input type="number" min="1" value={l.antall} onChange={e=>oppdaterLinje(l.id,'antall',e.target.value)} style={{ width:50, padding:'8px 6px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', textAlign:'center' }}/></td>
                      <td style={{ padding:'6px 8px' }}><select value={l.enhet} onChange={e=>oppdaterLinje(l.id,'enhet',e.target.value)} style={{ padding:'8px 6px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:12, outline:'none' }}>{['stk','par','time','mnd','år','sett'].map(u=><option key={u}>{u}</option>)}</select></td>
                      <td style={{ padding:'6px 8px' }}><input type="number" value={l.pris} onChange={e=>oppdaterLinje(l.id,'pris',e.target.value)} placeholder="0" style={{ width:76, padding:'8px 8px', borderRadius:8, border:`1px solid ${l.pris?T.accent:T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', textAlign:'right' }}/></td>
                      <td style={{ padding:'6px 8px', fontWeight:900, color:sum>0?T.green:T.muted, textAlign:'right', whiteSpace:'nowrap', fontSize:14 }}>{sum>0?`${sum.toLocaleString('nb-NO')} kr`:'–'}</td>
                      <td style={{ padding:'6px 4px' }}>{linjer.length>1&&<button onClick={()=>fjernLinje(l.id)} style={{ background:'none', border:'none', color:T.red, cursor:'pointer', fontSize:16, padding:'2px 4px' }}>×</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={leggTilLinje} style={{ marginTop:10, padding:'9px 16px', borderRadius:9, border:`1px dashed ${T.accent}`, background:`${T.accent}10`, color:T.accent, cursor:'pointer', fontWeight:800, fontSize:13, width:'100%' }}>+ Legg til linje</button>
          {subtotal>0 && (
            <div style={{ marginTop:16, borderTop:`1px solid ${T.border}`, paddingTop:12 }}>
              {[{l:'Subtotal (eks. mva)',v:`${subtotal.toLocaleString('nb-NO')} kr`,bold:false},{l:'MVA 25%',v:`${mva.toLocaleString('nb-NO')} kr`,bold:false},{l:'TOTALT',v:`${total.toLocaleString('nb-NO')} kr`,bold:true}].map(r=>(
                <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:r.bold?16:13 }}>
                  <span style={{ color:r.bold?T.text:T.muted, fontWeight:r.bold?900:500 }}>{r.l}</span>
                  <span style={{ color:r.bold?T.green:T.muted, fontWeight:r.bold?900:500 }}>{r.v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Steg 3 */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:26, height:26, borderRadius:'50%', background:T.accent, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0 }}>3</span>
            Detaljer
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
            <div style={{ flex:1, minWidth:140 }}>
              <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:5 }}>Forfallsdato</div>
              <input type="date" value={forfall} onChange={e=>setForfall(e.target.value)} style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }}/>
            </div>
            <div style={{ flex:2, minWidth:180 }}>
              <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:5 }}>Notat til mottaker</div>
              <input value={notat} onChange={e=>setNotat(e.target.value)} placeholder="F.eks. Betales til konto 6013.05.06544" style={{ width:'100%', padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }}/>
            </div>
          </div>
        </div>

        {/* Steg 4 */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, marginBottom:18 }}>
          <div style={{ fontWeight:900, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:26, height:26, borderRadius:'50%', background:T.accent, color:'#fff', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0 }}>4</span>
            Send via / eksporter til
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 }}>
            {INTEGRASJONER.map(int=>(
              <button key={int.key} onClick={()=>setIntValg(int.key)} style={{ padding:'12px 10px', borderRadius:11, border:`2px solid ${intValg===int.key?int.color:T.border}`, background:intValg===int.key?`${int.color}18`:T.surface, color:T.text, cursor:'pointer', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:22 }}>{int.logo}</span>
                <span style={{ fontWeight:800, fontSize:12, color:intValg===int.key?int.color:T.text }}>{int.label}</span>
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const ready = (mottaker==='member'?valgtMedlem:fritekstNavn.trim()) && linjer.some(l=>l.beskrivelse.trim()&&l.pris)
          return <button onClick={sendFaktura} disabled={!ready||sendLoading} style={{ width:'100%', padding:'18px', borderRadius:14, border:'none', background:ready&&!sendLoading?T.accent:T.dim, color:'#fff', fontWeight:900, fontSize:17, cursor:ready&&!sendLoading?'pointer':'not-allowed', opacity:ready?1:0.5 }}>{sendLoading?'Sender…':`🧾 Send faktura${total>0?' – '+total.toLocaleString('nb-NO')+' kr':''}`}</button>
        })()}
      </div>
    )
  }

  if (step==='sendt') {
    const siste = fakturaer[0]; const intD = INTEGRASJONER.find(i=>i.key===siste?.integrert)
    return (
      <div style={{ textAlign:'center', padding:'32px 16px' }}>
        <div style={{ fontSize:64, marginBottom:12 }}>🎉</div>
        <div style={{ fontWeight:900, fontSize:22, color:T.green, marginBottom:6 }}>Faktura sendt!</div>
        <div style={{ color:T.muted, fontSize:14, marginBottom:6 }}>Fakturanr: <strong style={{ color:T.accent }}>{siste?.id}</strong></div>
        <div style={{ color:T.muted, fontSize:14, marginBottom:20 }}>Mottaker: <strong style={{ color:T.text }}>{siste?.mottaker}</strong> · Sum: <strong style={{ color:T.green }}>{siste?.total.toLocaleString('nb-NO')} kr</strong></div>
        {intD && <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:10, background:`${intD.color}18`, border:`1px solid ${intD.color}44`, marginBottom:20, fontSize:13, color:intD.color, fontWeight:800 }}><span>{intD.logo}</span> Eksportert til {intD.label}</div>}
        <div style={{ maxWidth:380, margin:'0 auto 24px', background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18, textAlign:'left' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, alignItems:'flex-start' }}>
            <div><div style={{ fontWeight:900, fontSize:15 }}>SPARTACUS</div><div style={{ fontSize:11, color:T.muted }}>Treningsklubb</div></div>
            <div style={{ textAlign:'right' }}><div style={{ fontWeight:900, color:T.accent, fontSize:13 }}>{siste?.id}</div><div style={{ fontSize:11, color:T.muted }}>Dato: {siste?.dato}</div><div style={{ fontSize:11, color:T.muted }}>Forfall: {siste?.forfall}</div></div>
          </div>
          <div style={{ fontWeight:800, marginBottom:10 }}>Til: {siste?.mottaker}</div>
          <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10 }}>
            {siste?.linjer.map((l,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:T.muted }}>
                <span>{l.antall}x {l.beskrivelse}</span><span style={{ color:T.text, fontWeight:700 }}>{((parseFloat(l.pris)||0)*(parseInt(l.antall)||0)).toLocaleString('nb-NO')} kr</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${T.border}`, marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:15 }}><span>TOTALT</span><span style={{ color:T.green }}>{siste?.total.toLocaleString('nb-NO')} kr</span></div>
          {siste?.notat&&<div style={{ marginTop:8, fontSize:11, color:T.muted, fontStyle:'italic' }}>{siste.notat}</div>}
        </div>
        <div style={{ display:'flex', gap:10, maxWidth:380, margin:'0 auto' }}>
          <button onClick={()=>{ resetSkjema(); setStep('ny') }} style={{ flex:1, padding:'13px', borderRadius:12, border:`1px solid ${T.accent}`, background:`${T.accent}18`, color:T.accent, fontWeight:800, cursor:'pointer', fontSize:14 }}>+ Ny faktura</button>
          <button onClick={()=>setStep('liste')} style={{ flex:1, padding:'13px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:800, cursor:'pointer', fontSize:14 }}>← Se alle</button>
        </div>
      </div>
    )
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ManageTab({ members, setMembers, onSync, miStatus }) {
  const [subTab, setSub]  = useState('import_export')
  const [newName, setNN]  = useState('')
  const [newDisc, setND]  = useState('MMA')
  const [newCoach, setNC] = useState(false)
  const [importTxt, setIT]= useState('')
  const [importMsg, setIM]= useState('')
  const fileRef = useRef()

  function downloadFile(content, filename, type) {
    const blob = new Blob(['\uFEFF'+content], {type:type+';charset=utf-8'})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url)
  }
  function exportMembersCSV() {
    const header = 'Navn,Disiplin,Rolle,Min Idrett Status,Utløpsdato'
    const rows   = members.map(m=>[m.name,m.disc,m.isCoach?'Trener':'Utøver',MI_STATUS_DISPLAY[getMiStatus(m)].label,m.miExpires||''].join(','))
    downloadFile([header,...rows].join('\n'),'spartacus_medlemmer.csv','text/csv')
  }
  function exportMembersJSON() { downloadFile(JSON.stringify(members,null,2),'spartacus_medlemmer.json','application/json') }
  function handleImport() {
    const lines     = importTxt.trim().split('\n').filter(Boolean)
    const isHeader  = lines[0]?.toLowerCase().includes('navn')||lines[0]?.toLowerCase().includes('name')
    const dataLines = isHeader?lines.slice(1):lines
    const added = []
    dataLines.forEach(line => {
      const parts = line.split(/[,;\t]+/)
      const name  = (parts[0]||'').trim().replace(/^"|"$/g,'')
      const disc  = (parts[1]||'MMA').trim().replace(/^"|"$/g,'')
      const role  = (parts[2]||'').trim().toLowerCase()
      if (name && !members.find(m=>m.name.toLowerCase()===name.toLowerCase()))
        added.push({ id:`mi_imp${Date.now()}${Math.random()}`, name, disc, isCoach:role.includes('trener')||role.includes('coach'), miActive:false, miExpires:null, miUnpaid:false, notMember:true })
    })
    if (added.length) { setMembers(p=>[...p,...added]); setIM(`✅ Importerte ${added.length} nye`) }
    else setIM('⚠️ Ingen nye å importere')
    setIT('')
  }
  function addMember() {
    if (!newName.trim()) return
    setMembers(p=>[...p,{ id:`mi_man${Date.now()}`, name:newName.trim(), disc:newCoach?'–':newDisc, isCoach:newCoach, miActive:false, miExpires:null, miUnpaid:false, notMember:true }])
    setNN(''); setNC(false)
  }

  const tabs2 = [{key:'import_export',label:'📥 Import / Eksport'},{key:'members',label:'👥 Legg til manuelt'},{key:'mi_settings',label:'⚙️ Min Idrett'}]

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {tabs2.map(t=>(
          <button key={t.key} onClick={()=>setSub(t.key)} style={{ padding:'7px 13px', borderRadius:9, border:`1px solid ${subTab===t.key?T.accent:T.border}`, background:subTab===t.key?T.accent:'transparent', color:subTab===t.key?'#fff':T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>{t.label}</button>
        ))}
      </div>
      {subTab==='import_export' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontWeight:900, fontSize:14, marginBottom:4 }}>📤 Eksporter</div>
            <div style={{ color:T.muted, fontSize:13, marginBottom:14 }}>Last ned til Excel/CSV inkl. Min Idrett-status.</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={exportMembersCSV}  style={{ padding:'10px 16px', borderRadius:10, border:`1px solid ${T.green}55`, background:`${T.green}15`, color:T.green, cursor:'pointer', fontWeight:800, fontSize:13 }}>📋 Medlemmer (.csv)</button>
              <button onClick={exportMembersJSON} style={{ padding:'10px 16px', borderRadius:10, border:`1px solid ${T.blue}55`,  background:`${T.blue}15`,  color:T.blue,  cursor:'pointer', fontWeight:800, fontSize:13 }}>📦 Medlemmer (.json)</button>
            </div>
          </div>
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontWeight:900, fontSize:14, marginBottom:4 }}>📥 Importer</div>
            <div style={{ color:T.muted, fontSize:13, marginBottom:6 }}>Format: <code style={{ background:T.surface, padding:'2px 6px', borderRadius:5 }}>Navn, Gren, Rolle</code></div>
            <div style={{ padding:'9px 14px', borderRadius:8, background:`${T.yellow}12`, border:`1px solid ${T.yellow}44`, fontSize:12, color:T.yellow, marginBottom:12 }}>⚠️ Manuelt importerte får status <strong>Ikke medlem</strong> inntil verifisert i Min Idrett.</div>
            <button onClick={()=>fileRef.current.click()} style={{ marginBottom:10, padding:'9px 14px', borderRadius:9, border:`1px dashed ${T.border}`, background:T.surface, color:T.muted, cursor:'pointer', fontSize:13 }}>📎 Last opp .csv eller .txt</button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{setIT(ev.target.result);setIM('')}; r.readAsText(f,'UTF-8') }}/>
            <textarea value={importTxt} onChange={e=>{setIT(e.target.value);setIM('')}} placeholder={'Torpal Merjoev, MMA\nLena Hagen, Kickboksing\nErik Strand, MMA, Trener'} style={{ width:'100%', height:110, padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'monospace' }}/>
            <button onClick={handleImport} style={{ marginTop:8, width:'100%', padding:'12px', borderRadius:10, border:'none', background:T.accent, color:'#fff', fontWeight:900, fontSize:14, cursor:'pointer' }}>Importer</button>
            {importMsg && <div style={{ marginTop:8, color:importMsg.startsWith('✅')?T.green:T.yellow, fontWeight:700, fontSize:13 }}>{importMsg}</div>}
          </div>
        </div>
      )}
      {subTab==='members' && (
        <>
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:14 }}>
            <div style={{ fontWeight:800, marginBottom:10, fontSize:13 }}>+ Legg til manuelt</div>
            <div style={{ padding:'8px 12px', borderRadius:8, background:`${T.yellow}12`, border:`1px solid ${T.yellow}44`, fontSize:12, color:T.yellow, marginBottom:10 }}>⚠️ Får status <strong>Ikke medlem</strong> inntil verifisert i Min Idrett.</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <input value={newName} onChange={e=>setNN(e.target.value)} placeholder="Fullt navn…" onKeyDown={e=>e.key==='Enter'&&addMember()} style={{ flex:1, minWidth:140, padding:'9px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.text, fontSize:14, outline:'none' }}/>
              <select value={newDisc} onChange={e=>setND(e.target.value)} disabled={newCoach} style={selSt}>{DISCIPLINES.slice(1).map(d=><option key={d}>{d}</option>)}</select>
              <label style={{ display:'flex', alignItems:'center', gap:5, color:T.muted, fontSize:13, cursor:'pointer' }}><input type="checkbox" checked={newCoach} onChange={e=>setNC(e.target.checked)} style={{ accentColor:T.gold }}/>Trener</label>
              <button onClick={addMember} style={{ padding:'9px 16px', borderRadius:9, border:'none', background:T.accent, color:'#fff', fontWeight:800, cursor:'pointer' }}>Legg til</button>
            </div>
          </div>
          <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
            {members.map((m,i)=>{
              const miSt=getMiStatus(m); const d=MI_STATUS_DISPLAY[miSt]
              return (
                <div key={m.id} style={{ padding:'11px 14px', borderBottom:i<members.length-1?`1px solid ${T.border}`:'none', display:'flex', alignItems:'center', gap:10 }}>
                  <Avatar name={m.name} size={30}/><span style={{ flex:1, fontWeight:600 }}>{m.name}</span>
                  <Tag c={d.color}>{d.label}</Tag><Tag c={T.blue}>{m.disc}</Tag>
                  {m.isCoach&&<Tag c={T.gold}>TRENER</Tag>}
                  <button onClick={()=>setMembers(p=>p.filter(x=>x.id!==m.id))} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:15 }}>🗑</button>
                </div>
              )
            })}
          </div>
        </>
      )}
      {subTab==='mi_settings' && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:20 }}>
          <div style={{ fontWeight:900, fontSize:15, marginBottom:14 }}>Min Idrett integrasjon</div>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, padding:14, borderRadius:12, background:T.surface, border:`1px solid ${miStatus.status==='ok'?T.green:T.border}` }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:miStatus.status==='ok'?T.green:miStatus.status==='syncing'?T.yellow:T.muted, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:13 }}>{miStatus.status==='ok'?'Tilkoblet (mock)':miStatus.status==='syncing'?'Synkroniserer…':'Ikke tilkoblet'}</div>
              <div style={{ fontSize:11, color:T.muted }}>{miStatus.fetchedAt?`Sist oppdatert: ${new Date(miStatus.fetchedAt).toLocaleString('nb-NO')}`:''}{miStatus.count>0?` · ${miStatus.count} medlemmer`:''}</div>
            </div>
            <button onClick={onSync} style={{ padding:'8px 14px', borderRadius:9, border:`1px solid ${T.accent}`, background:'transparent', color:T.accent, fontWeight:800, cursor:'pointer', fontSize:12 }}>{miStatus.status==='syncing'?'Synker…':'↻ Synk nå'}</button>
          </div>
          {Object.entries(MI_STATUS_DISPLAY).map(([key,d])=>(
            <div key={key} style={{ padding:'11px 14px', borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:d.color, flexShrink:0 }}/>
              <span style={{ fontWeight:800, color:d.color, fontSize:13, minWidth:130 }}>{d.label}</span>
              <span style={{ fontSize:12, color:T.muted }}>
                {key==='active'&&'Gyldig betalende medlem i Min Idrett'}
                {key==='expired'&&'Utløpt dato – krever fornyelse'}
                {key==='unpaid'&&'Åpen faktura hos Min Idrett'}
                {key==='not_member'&&'Manuelt registrert eller gjest'}
              </span>
            </div>
          ))}
          <div style={{ padding:14, borderRadius:10, background:`${T.blue}12`, border:`1px solid ${T.blue}33`, marginTop:8 }}>
            <div style={{ fontWeight:800, color:T.blue, marginBottom:6, fontSize:13 }}>🔌 Koble til ekte Min Idrett API</div>
            <div style={{ color:T.muted, fontSize:12, lineHeight:1.8 }}>
              1. Registrer klubben på <strong style={{ color:T.text }}>idrettsforbundet.no</strong><br/>
              2. Få API-tilgang fra NIF<br/>
              3. Bytt ut <code style={{ background:T.surface, padding:'1px 5px', borderRadius:4 }}>mockMinIdrettFetch()</code> med ekte REST-kall
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
