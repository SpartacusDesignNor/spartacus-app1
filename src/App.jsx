import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const LATE_CUTOFF_MINS  = 20
const LS_MEMBERS        = 'spartacus_members'
const LS_ATTENDANCE     = 'spartacus_attendance'
const LS_OVERRIDES      = 'spartacus_schedule_overrides'
const LS_DELETED        = 'spartacus_deleted_members'
const LS_FAKTURAER      = 'spartacus_fakturaer'
const LS_SPESIALAVTALER = 'spartacus_spesialavtaler'

const FRITIDSKORT_VALUE  = 1995
const FRITIDSKORT_MONTHS = 5
const JUNIOR_AGE_LIMIT   = 18
const JUNIOR_AVGIFT      = 349
const SENIOR_AVGIFT      = 499

const DISCIPLINES = ['Alle','Boksing','MMA','Kickboksing','Muay Thai','Grappling']

const BETALING_STATUSER = [
  { key:'ikke_forfalt', label:'Ikke forfalt', color:'#4caf72', icon:'✅' },
  { key:'forfalt',      label:'Forfalt',       color:'#f5c842', icon:'⚠️' },
  { key:'purret',       label:'Purret',        color:'#fb923c', icon:'📬' },
  { key:'inkasso',      label:'Inkasso',       color:'#e63946', icon:'⛔' },
]

const SESSION_STATUSES = [
  { key:'normal',       label:'Normal',       color:'#4caf72', icon:'✅' },
  { key:'cancelled',    label:'Avlyst',       color:'#e63946', icon:'⛔' },
  { key:'holiday',      label:'Ferie',         color:'#f5c842', icon:'🏖️' },
  { key:'no_training',  label:'Ingen trening', color:'#777',    icon:'🚫' },
  { key:'open_mat',     label:'Åpen matte',    color:'#60a5fa', icon:'🤼' },
]

const SCHEDULE = {
  Mandag:  [{ name:'Boksing',         disc:'Boksing',     start:'18:00', end:'19:00', icon:'🥊' },
            { name:'Grappling',       disc:'Grappling',   start:'19:00', end:'20:00', icon:'🤼' }],
  Tirsdag: [{ name:'Grappling',       disc:'Grappling',   start:'18:00', end:'19:00', icon:'🤼' },
            { name:'Kickboksing',     disc:'Kickboksing', start:'19:00', end:'20:00', icon:'🦵' }],
  Onsdag:  [{ name:'Mini Spartacus',  disc:'MMA', start:'17:00', end:'18:00', icon:'🧸' },
            { name:'Basic MMA',       disc:'MMA', start:'18:00', end:'19:00', icon:'🥋' },
            { name:'Advance MMA',     disc:'MMA', start:'19:00', end:'20:00', icon:'⚔️' }],
  Torsdag: [{ name:'Muay Thai',       disc:'Muay Thai',   start:'18:00', end:'19:00', icon:'🦵' },
            { name:'Boksing',         disc:'Boksing',     start:'19:00', end:'20:00', icon:'🥊' },
            { name:'Sparring',        disc:'Boksing',     start:'20:00', end:'21:00', icon:'🥊' }],
  Fredag:  [{ name:'Mini Spartacus',  disc:'MMA', start:'17:00', end:'18:00', icon:'🧸' },
            { name:'Elite MMA',       disc:'MMA', start:'18:00', end:'19:00', icon:'🏆' }],
  Lørdag:  [{ name:'Sparring',        disc:'Boksing', start:'12:00', end:'14:00', icon:'🥊' },
            { name:'Kampsport & Sosialt', disc:'MMA', start:'21:00', end:'22:30', icon:'🍕' }],
  Søndag:  [{ name:'Kickboksing',     disc:'Kickboksing', start:'17:00', end:'18:00', icon:'🦵' }],
}

const DAYS_NO = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag']
const FAKTURA_KATEGORIER = ['Treningsavgift','Utstyr','Supporter-utstyr','Treningsklær','Leie','Kurs','Dugnad','Annet']

const toMins     = h => { const [a,b] = h.split(':').map(Number); return a*60+b }
const nowHHMM    = () => { const d = new Date(); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') }
const todayISO   = () => new Date().toISOString().split('T')[0]
const todayName  = () => DAYS_NO[new Date().getDay() === 0 ? 6 : new Date().getDay()-1]
const daysAgo    = n => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0] }
const daysFromNow= n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0] }
const genNr      = () => 'SPAR-' + new Date().getFullYear() + '-' + Math.floor(1000+Math.random()*9000)
const ovKey      = (date, name) => date + '|' + name

function getAge(birthDate) {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function isJunior(member) {
  const age = getAge(member.birthDate)
  if (age === null) return false
  return age < JUNIOR_AGE_LIMIT
}

function getNextFakturaDate() {
  const now   = new Date()
  const first = new Date(now.getFullYear(), now.getMonth()+1, 1)
  let mondays = 0
  for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate()+1)) {
    if (d.getDay() === 1) {
      mondays++
      if (mondays === 2) return d.toISOString().split('T')[0]
    }
  }
  return daysFromNow(30)
}

function getFritidskortstatus(member) {
  if (!member.fritidskort) return null
  const start = new Date(member.fritidskort.startDate)
  const end   = new Date(start)
  end.setMonth(end.getMonth() + FRITIDSKORT_MONTHS)
  const today = new Date()
  return {
    active:   today < end,
    endDate:  end.toISOString().split('T')[0],
    daysLeft: Math.max(0, Math.floor((end - today) / 86400000)),
  }
}

function getSessionState(session, nowStr) {
  const now    = toMins(nowStr || nowHHMM())
  const start  = toMins(session.start)
  const end    = toMins(session.end)
  const minsIn = now - start
  if (now < start - 30)          return { open:false, late:false, minsIn, reason:'not_open_yet' }
  if (now > end)                  return { open:false, late:false, minsIn, reason:'ended' }
  if (minsIn > LATE_CUTOFF_MINS) return { open:false, late:true,  minsIn, reason:'closed_late' }
  return { open:true, late:minsIn > 0, minsIn }
}

function getOpenSessions(day, now) {
  return (SCHEDULE[day || todayName()] || []).filter(s => getSessionState(s, now).open)
}

function calcElig(attended, total) {
  if (total === 0) return { label:'Ikke kampklar', color:'#e63946', bg:'#2e0a0e', pct:0 }
  const pct = Math.round((attended/total)*100)
  if (pct >= 80) return { label:'Kampklar',    color:'#4caf72', bg:'#0d2e1a', pct }
  if (pct >= 60) return { label:'Må vurderes', color:'#f5c842', bg:'#2e2600', pct }
  return { label:'Ikke kampklar', color:'#e63946', bg:'#2e0a0e', pct }
}

function getMiStatus(member) {
  if (!member || member.isGuest || member.notMember) return 'not_member'
  if (member.betalingStatus === 'inkasso') return 'inkasso'
  if (member.miUnpaid) return 'unpaid'
  if (member.miActive === false || (member.miExpires && member.miExpires < todayISO())) return 'expired'
  return 'active'
}

function mockMIFetch() {
  return new Promise(res => setTimeout(() => {
    res({ fetchedAt: new Date().toISOString(), members: [
      { id:'mi_1',  name:'Torpal Merjoev',  disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4791234567', email:'torpal@example.com',   birthDate:'2000-03-15' },
      { id:'mi_2',  name:'Erik Strand',     disc:'MMA',         role:'coach',   expires:'2025-12-31', active:true,  unpaid:false, phone:'+4792345678', email:'erik@example.com',     birthDate:'1985-07-22' },
      { id:'mi_3',  name:'Marcus Dahl',     disc:'Boksing',     role:'coach',   expires:'2025-12-31', active:true,  unpaid:false, phone:'+4793456789', email:'marcus@example.com',   birthDate:'1980-11-05' },
      { id:'mi_4',  name:'Bjørn Eriksen',   disc:'Boksing',     role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4794567890', email:'bjorn@example.com',    birthDate:'1995-04-18' },
      { id:'mi_5',  name:'Lena Hagen',      disc:'Kickboksing', role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4795678901', email:'lena@example.com',     birthDate:'2008-09-30' },
      { id:'mi_6',  name:'Nora Vik',        disc:'Grappling',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4796789012', email:'nora@example.com',     birthDate:'2010-01-12' },
      { id:'mi_7',  name:'Anders Haugen',   disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4797890123', email:'anders@example.com',   birthDate:'1998-06-25' },
      { id:'mi_8',  name:'Sofie Lie',       disc:'Muay Thai',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:true,  phone:'+4798901234', email:'sofie@example.com',    birthDate:'2007-12-03' },
      { id:'mi_9',  name:'Jonas Berg',      disc:'Boksing',     role:'athlete', expires:'2024-06-30', active:false, unpaid:false, phone:'+4799012345', email:'jonas@example.com',    birthDate:'1992-08-14' },
      { id:'mi_10', name:'Emilie Sørensen', disc:'Kickboksing', role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4790123456', email:'emilie@example.com',   birthDate:'2009-05-20' },
      { id:'mi_11', name:'Tobias Moe',      disc:'MMA',         role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4791122334', email:'tobias@example.com',   birthDate:'2011-02-28' },
      { id:'mi_12', name:'Ylva Næss',       disc:'Grappling',   role:'athlete', expires:'2025-12-31', active:true,  unpaid:false, phone:'+4792233445', email:'ylva@example.com',     birthDate:'2006-10-08' },
    ]})
  }, 900))
}

function seedAtt(members) {
  const att = []
  members.forEach(m => {
    for (let i = 0; i < 90; i++) {
      const date    = daysAgo(i)
      const dayIdx  = new Date(date).getDay()
      const dayName = DAYS_NO[dayIdx === 0 ? 6 : dayIdx-1]
      const sessions= SCHEDULE[dayName] || []
      if (!sessions.length || Math.random() > 0.55) continue
      const sess    = sessions[Math.floor(Math.random()*sessions.length)]
      const r       = Math.random()
      const status  = r < 0.70 ? 'attended' : r < 0.88 ? 'strength' : 'absent'
      const isLate  = status !== 'absent' && Math.random() > 0.80
      att.push({
        id: 'a' + att.length,
        memberId: m.id,
        memberName: m.name,
        date, day: dayName,
        session: sess.name, disc: sess.disc,
        status, isLate,
        lateMinutes: isLate ? Math.floor(Math.random()*19)+1 : 0,
        injuryNote: null,
        registeredAt: sess.start,
        createdAt: new Date(date).toISOString(),
        miStatus: 'active',
      })
    }
  })
  return att
}

const T = {
  bg:'#080808', surface:'#111', card:'#161616', border:'#252525',
  accent:'#e8006a', accentL:'#ff4da6',
  gold:'#f4a261', green:'#4caf72', yellow:'#f5c842', red:'#e63946',
  blue:'#60a5fa', orange:'#fb923c', purple:'#a855f7',
  text:'#f2f2f2', muted:'#777', dim:'#444',
}

const selSt  = { padding:'8px 10px', borderRadius:9, border:'1px solid #252525', background:'#111', color:'#f2f2f2', fontSize:12, outline:'none' }
const inputSt= { width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid #252525', background:'#111', color:'#f2f2f2', fontSize:14, outline:'none', boxSizing:'border-box' }

function Screen({ children, center }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: center ? 'center' : 'flex-start', minHeight:'calc(100vh - 58px)', padding:'18px 14px', maxWidth:520, margin:'0 auto' }}>
      {children}
    </div>
  )
}

function BigBtn({ children, onClick, style, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ width:'100%', padding:'15px', borderRadius:13, border:'none', background: disabled ? T.dim : T.accent, color:'#fff', fontWeight:900, fontSize:15, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, ...style }}
    >
      {children}
    </button>
  )
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:13, marginBottom:12, padding:0 }}>
      ← Tilbake
    </button>
  )
}

function Tag({ children, c }) {
  return (
    <span style={{ padding:'3px 8px', borderRadius:99, background: c + '22', color:c, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>
      {children}
    </span>
  )
}

function Avatar({ name, size }) {
  size = size || 34
  const initials = name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
  const hue = (name.charCodeAt(0)*37 + (name.charCodeAt(name.length-1)||0)*17) % 360
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'hsl('+hue+',45%,22%)', border:'1px solid hsl('+hue+',45%,35%)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:size*0.35, color:'hsl('+hue+',70%,70%)', flexShrink:0 }}>
      {initials}
    </div>
  )
}

function SpartacusLogo({ size, showText }) {
  size = size || 64
  showText = showText !== false
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: showText ? 10 : 0 }}>
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
      {showText && (
        <div style={{ fontWeight:900, fontSize:size*0.28, letterSpacing:'0.15em', color:'#fff', textTransform:'uppercase', lineHeight:1 }}>
          SPARTACUS
        </div>
      )}
    </div>
  )
}

function StatusBar({ counts }) {
  const items = [
    { key:'active',      icon:'✅', label:'Aktive',     c:T.green  },
    { key:'forfalt',     icon:'⚠️', label:'Forfalt',    c:T.yellow },
    { key:'purret',      icon:'📬', label:'Purret',     c:T.orange },
    { key:'inkasso',     icon:'⛔', label:'Inkasso',    c:T.red    },
    { key:'fritidskort', icon:'🎫', label:'Fritidskort',c:T.purple },
    { key:'junior',      icon:'🧒', label:'Junior',     c:T.blue   },
    { key:'senior',      icon:'👤', label:'Senior',     c:T.gold   },
  ].filter(i => counts[i.key] !== undefined && counts[i.key] > 0)

  if (!items.length) return null

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
      {items.map(it => (
        <div key={it.key} style={{ background:T.card, border:'1px solid ' + it.c + '44', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:14 }}>{it.icon}</span>
          <div style={{ lineHeight:1 }}>
            <div style={{ fontWeight:900, fontSize:16, color:it.c }}>{counts[it.key]}</div>
            <div style={{ fontSize:9, color:T.muted, fontWeight:700, textTransform:'uppercase', marginTop:1 }}>{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [view, setView]           = useState('kiosk')
  const [members, setMembers]     = useState(() => lsGet(LS_MEMBERS, []))
  const [attendance, setAtt]      = useState(() => lsGet(LS_ATTENDANCE, []))
  const [overrides, setOverrides] = useState(() => lsGet(LS_OVERRIDES, {}))
  const [fakturaer, setFakturaer] = useState(() => lsGet(LS_FAKTURAER, []))
  const [spesial, setSpesial]     = useState(() => lsGet(LS_SPESIALAVTALER, {}))
  const [adminAuth, setAdminAuth] = useState(false)
  const [miSt, setMiSt]           = useState({ status:'idle', fetchedAt:null, count:0 })

  const saveOverrides = useCallback(o => { lsSet(LS_OVERRIDES, o); setOverrides(o) }, [])
  const saveSpesial   = useCallback(s => { lsSet(LS_SPESIALAVTALER, s); setSpesial(s) }, [])

  const syncMI = useCallback(async () => {
    setMiSt(s => ({ ...s, status:'syncing' }))
    try {
      const result  = await mockMIFetch()
      const fetched = result.members.map(m => ({
        id: m.id, name: m.name, disc: m.disc,
        phone: m.phone || '', email: m.email || '',
        isCoach: m.role === 'coach',
        miActive: m.active, miExpires: m.expires,
        miUnpaid: m.unpaid || false, notMember: false,
        birthDate: m.birthDate || '',
        firstName:'', lastName:'', address:'', postalCode:'', city:'', gender:'',
      }))
      setMembers(prev => {
        const saved      = lsGet(LS_MEMBERS, [])
        const deleted    = lsGet(LS_DELETED, [])
        const savedIds   = new Set(saved.map(m => m.id))
        const deletedIds = new Set(deleted)
        const toAdd      = fetched.filter(f => !savedIds.has(f.id) && !deletedIds.has(f.id))
        const merged     = toAdd.length > 0 ? [...saved, ...toAdd] : saved
        if (toAdd.length > 0) lsSet(LS_MEMBERS, merged)
        return merged
      })
      setAtt(prev => {
        if (prev.length > 0) return prev
        const seeded = seedAtt(fetched)
        lsSet(LS_ATTENDANCE, seeded)
        return seeded
      })
      setMiSt({ status:'ok', fetchedAt: result.fetchedAt, count: result.members.length })
    } catch {
      setMiSt(s => ({ ...s, status:'error' }))
    }
  }, [])

  useEffect(() => {
    syncMI()
    const iv = setInterval(syncMI, 60000)
    return () => clearInterval(iv)
  }, [syncMI])

  // Auto-escalate overdue invoices
  useEffect(() => {
    const today = todayISO()
    let changed = false
    const updated = fakturaer.map(f => {
      if (f.betalingStatus === 'betalt' || f.betalingStatus === 'inkasso') return f
      if (f.forfall < today) {
        const days = Math.floor((new Date(today) - new Date(f.forfall)) / 86400000)
        let ns = f.betalingStatus
        if (days > 60  && ns !== 'inkasso') { ns = 'inkasso'; changed = true }
        else if (days > 14 && ns === 'forfalt') { ns = 'purret'; changed = true }
        else if (days > 0  && ns === 'ikke_forfalt') { ns = 'forfalt'; changed = true }
        return { ...f, betalingStatus: ns }
      }
      return f
    })
    if (changed) { setFakturaer(updated); lsSet(LS_FAKTURAER, updated) }
  }, [fakturaer])

  const addAtt = useCallback(e => {
    setAtt(prev => {
      const updated = [{ id:'a' + Date.now(), createdAt: new Date().toISOString(), ...e }, ...prev]
      lsSet(LS_ATTENDANCE, updated)
      return updated
    })
  }, [])

  const editAtt = useCallback((id, patch) => {
    setAtt(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...patch } : a)
      lsSet(LS_ATTENDANCE, updated)
      return updated
    })
  }, [])

  const delAtt = useCallback(id => {
    setAtt(prev => {
      const updated = prev.filter(a => a.id !== id)
      lsSet(LS_ATTENDANCE, updated)
      return updated
    })
  }, [])

  const syncColor = miSt.status === 'ok' ? T.green : miSt.status === 'syncing' ? T.yellow : miSt.status === 'error' ? T.red : T.muted

  return (
    <div style={{ fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif", background:T.bg, color:T.text, minHeight:'100vh' }}>
      <div style={{ background:'#0d0d0d', borderBottom:'2px solid ' + T.accent, padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:200, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <SpartacusLogo size={30} showText={false}/>
          <div style={{ fontWeight:900, fontSize:15, letterSpacing:'0.12em' }}>SPARTACUS</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <button onClick={syncMI} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 9px', borderRadius:7, border:'1px solid ' + syncColor + '55', background:'transparent', color:syncColor, cursor:'pointer', fontSize:10, fontWeight:800 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:syncColor }}/>
            {miSt.status === 'syncing' ? 'Synker…' : miSt.status === 'ok' ? 'MI ' + miSt.count : 'Min Idrett'}
          </button>
          <nav style={{ display:'flex', gap:3 }}>
            {[{key:'kiosk',label:'🏃 Innsjekk'},{key:'schedule',label:'📅 Timeplan'},{key:'dashboard',label:(adminAuth ? '🔓' : '🔐') + ' Admin'}].map(n => (
              <button key={n.key} onClick={() => setView(n.key)} style={{ padding:'7px 10px', borderRadius:8, border:'none', background: view === n.key ? T.accent : 'transparent', color: view === n.key ? '#fff' : T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {view === 'kiosk'     && <KioskView    members={members} setMembers={setMembers} attendance={attendance} onAdd={addAtt} overrides={overrides}/>}
      {view === 'schedule'  && <ScheduleView overrides={overrides}/>}
      {view === 'dashboard' && <Dashboard    members={members} setMembers={setMembers} attendance={attendance} auth={adminAuth} setAuth={setAdminAuth} editAtt={editAtt} delAtt={delAtt} syncMI={syncMI} miSt={miSt} overrides={overrides} saveOverrides={saveOverrides} onAdd={addAtt} fakturaer={fakturaer} setFakturaer={setFakturaer} spesial={spesial} saveSpesial={saveSpesial}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// KIOSK
// ═══════════════════════════════════════════════════════════
function KioskView({ members, setMembers, attendance, onAdd, overrides }) {
  const [step, setStep]         = useState('home')
  const [query, setQuery]       = useState('')
  const [session, setSession]   = useState(null)
  const [sessState, setSessState] = useState(null)
  const [person, setPerson]     = useState(null)
  const [status, setStatus]     = useState(null)
  const [injuryNote, setInj]    = useState('')
  const [miCheck, setMiCheck]   = useState(null)
  const [regPhone, setRegPhone] = useState('')
  const [regName, setRegName]   = useState('')
  const [regStep, setRegStep]   = useState('phone')
  const inputRef = useRef()

  const today        = todayISO()
  const openSessions = getOpenSessions()
  const filteredSess = openSessions.filter(s => {
    const ov = overrides[ovKey(today, s.name)]
    return !ov || ov.status === 'normal' || ov.status === 'open_mat'
  })

  useEffect(() => {
    if (step === 'name') setTimeout(() => inputRef.current && inputRef.current.focus(), 80)
  }, [step])

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return members.filter(m => m.name.toLowerCase().includes(q)).slice(0, 7)
  }, [query, members])

  function reset() {
    setStep('home'); setQuery(''); setSession(null); setSessState(null)
    setPerson(null); setStatus(null); setInj(''); setMiCheck(null)
    setRegPhone(''); setRegName(''); setRegStep('phone')
  }

  function goToSession(m) {
    setPerson(m)
    const st = getMiStatus(m)
    const display = {
      active:     { label:'Aktiv',        color:T.green,  bg:'#0d2e1a' },
      expired:    { label:'Utløpt',       color:T.yellow, bg:'#2e2600' },
      inkasso:    { label:'Inkasso',      color:T.red,    bg:'#2e0a0e' },
      unpaid:     { label:'Ubetalt',      color:T.yellow, bg:'#2e2600' },
      not_member: { label:'Ikke medlem',  color:T.muted,  bg:'#1a1a1a' },
    }[st] || { label:'Ukjent', color:T.muted, bg:'#1a1a1a' }
    setMiCheck({ status:st, ...display })
    if (filteredSess.length === 1) {
      setSession(filteredSess[0])
      setSessState(getSessionState(filteredSess[0]))
      setStep('status')
    } else if (filteredSess.length > 1) {
      setStep('session')
    } else {
      setStep('closed')
    }
  }

  function handleSelfReg() {
    const existing = members.find(m => m.phone === regPhone)
    if (existing) {
      goToSession(existing)
      return
    }
    if (regStep === 'phone') {
      setRegStep('info')
      return
    }
    const ny = {
      id: 'self_' + Date.now(),
      name: regName.trim(),
      phone: regPhone.trim(),
      email: '', disc: 'MMA', isCoach: false,
      miActive: false, miExpires: null, miUnpaid: false, notMember: true,
      birthDate: '', gender: '', address: '', postalCode: '', city: '',
      firstName: '', lastName: '',
    }
    const updated = [...members, ny]
    setMembers(updated)
    lsSet(LS_MEMBERS, updated)
    goToSession(ny)
  }

  function confirm() {
    const isLate = (sessState && sessState.late && sessState.minsIn > 0) ? true : false
    const lateMinutes = isLate ? Math.max(0, Math.floor(sessState.minsIn)) : 0
    const injNote = (status === 'strength' && injuryNote.trim()) ? injuryNote.trim() : null
    onAdd({
      memberId:     person.id || null,
      memberName:   person.name,
      date:         today,
      day:          todayName(),
      session:      session.name,
      disc:         session.disc,
      status:       status,
      isLate:       isLate,
      lateMinutes:  lateMinutes,
      injuryNote:   injNote,
      registeredAt: nowHHMM(),
      miStatus:     miCheck ? miCheck.status : 'not_member',
      isGuest:      false,
      isCoach:      person.isCoach ? true : false,
    })
    setStep('done')
  }

  const qrUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '?reg=1'

  if (step === 'home') return (
    <Screen center>
      <div style={{ marginBottom:16 }}><SpartacusLogo size={80} showText/></div>
      <div style={{ fontSize:13, fontWeight:800, letterSpacing:'0.18em', textTransform:'uppercase', color:'#ff4da6', marginBottom:20 }}>— Sterkere Sammen —</div>

      {(SCHEDULE[todayName()] || []).map(s => {
        const ov = overrides[ovKey(today, s.name)]
        if (!ov || ov.status === 'normal') return null
        const sd = SESSION_STATUSES.find(x => x.key === ov.status) || SESSION_STATUSES[0]
        return (
          <div key={s.name} style={{ width:'100%', padding:'9px 14px', borderRadius:9, marginBottom:6, background: sd.color + '18', border:'1px solid ' + sd.color + '55', color:sd.color, fontSize:12, fontWeight:700 }}>
            {sd.icon} {s.name} — {sd.label}{ov.note ? ' · ' + ov.note : ''}
          </div>
        )
      })}

      {filteredSess.length > 0 ? (
        <div style={{ width:'100%' }}>
          {filteredSess.map(s => (
            <div key={s.name} style={{ marginBottom:6, padding:'10px 14px', borderRadius:10, background: T.accent + '18', border:'1px solid ' + T.accent + '44', textAlign:'center' }}>
              <span style={{ fontWeight:800, color:T.accentL, fontSize:14 }}>{s.icon} {s.name}</span>
              <span style={{ color:T.muted, fontSize:11, marginLeft:8 }}>{s.start}–{s.end}</span>
            </div>
          ))}
          <BigBtn onClick={() => setStep('name')} style={{ marginTop:10, marginBottom:10 }}>
            📋 REGISTRER OPPMØTE
          </BigBtn>
        </div>
      ) : (
        <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:20, textAlign:'center', width:'100%', marginBottom:12 }}>
          <div style={{ fontSize:30, marginBottom:6 }}>🕐</div>
          <div style={{ fontWeight:700, marginBottom:4 }}>Ingen timer åpne nå</div>
          <div style={{ color:T.muted, fontSize:12 }}>Åpner 30 min før timen</div>
        </div>
      )}

      <div style={{ width:'100%', background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>📱 Ny? Meld deg inn med telefon</div>
        {regStep === 'phone' && (
          <div style={{ display:'flex', gap:8 }}>
            <input value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="+47 000 00 000" style={{ ...inputSt, flex:1 }} type="tel"/>
            <button onClick={handleSelfReg} disabled={regPhone.trim().length < 8} style={{ padding:'11px 14px', borderRadius:9, border:'none', background:T.accent, color:'#fff', fontWeight:800, cursor:'pointer', opacity: regPhone.trim().length < 8 ? 0.5 : 1 }}>→</button>
          </div>
        )}
        {regStep === 'info' && (
          <div>
            <div style={{ color:T.muted, fontSize:12, marginBottom:8 }}>Telefon ikke funnet. Skriv navn:</div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Fullt navn" style={{ ...inputSt, flex:1 }}/>
              <button onClick={handleSelfReg} disabled={!regName.trim()} style={{ padding:'11px 14px', borderRadius:9, border:'none', background:T.green, color:'#fff', fontWeight:800, cursor:'pointer', opacity: !regName.trim() ? 0.5 : 1 }}>✓</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ width:'100%', background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, textAlign:'center' }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>📷 Skann QR for å melde deg inn</div>
        <div style={{ background:'#fff', padding:10, borderRadius:12, display:'inline-block' }}>
          <img src={'https://chart.googleapis.com/chart?cht=qr&chs=130x130&chl=' + encodeURIComponent(qrUrl)} width={130} height={130} alt="QR" style={{ display:'block' }}/>
        </div>
      </div>
    </Screen>
  )

  if (step === 'closed') return (
    <Screen center>
      <BackBtn onClick={reset}/>
      <div style={{ fontSize:40, marginBottom:10 }}>⛔</div>
      <div style={{ fontWeight:900, fontSize:18, color:T.red }}>Ingen timer tilgjengelig</div>
      <BigBtn onClick={reset} style={{ marginTop:16, background:T.surface, border:'1px solid ' + T.border, color:T.muted }}>← Tilbake</BigBtn>
    </Screen>
  )

  if (step === 'name') return (
    <Screen>
      <BackBtn onClick={reset}/>
      <div style={{ fontSize:18, fontWeight:900, marginBottom:10 }}>Hvem er du?</div>
      <input
        ref={inputRef}
        style={{ width:'100%', padding:'15px 16px', borderRadius:12, border:'2px solid ' + T.accent, background:T.card, color:T.text, fontSize:18, outline:'none', boxSizing:'border-box', marginBottom:8 }}
        placeholder="Skriv navn…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoComplete="off"
      />
      {filtered.length > 0 && (
        <div style={{ width:'100%', background:T.card, border:'1px solid ' + T.border, borderRadius:12, overflow:'hidden', marginBottom:8 }}>
          {filtered.map(m => (
            <button key={m.id} onClick={() => goToSession(m)} style={{ width:'100%', padding:'12px 14px', background:'transparent', border:'none', borderBottom:'1px solid ' + T.border, color:T.text, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:10, fontSize:14 }}>
              <Avatar name={m.name}/>
              <span style={{ flex:1, fontWeight:700 }}>{m.name}</span>
              {isJunior(m) && <Tag c={T.blue}>Junior</Tag>}
              {m.isCoach && <Tag c={T.gold}>Trener</Tag>}
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && filtered.length === 0 && (
        <div style={{ width:'100%', background:T.card, border:'1px solid ' + T.border, borderRadius:10, padding:'12px 14px', color:T.muted, fontSize:13 }}>
          Ikke funnet — registrer deg med telefon på forsiden
        </div>
      )}
    </Screen>
  )

  if (step === 'session') return (
    <Screen>
      <BackBtn onClick={() => setStep('name')}/>
      <div style={{ fontSize:18, fontWeight:900, marginBottom:10 }}>Hvilken time?</div>
      {filteredSess.map(s => {
        const st = getSessionState(s)
        return (
          <button key={s.name} onClick={() => { setSession(s); setSessState(getSessionState(s)); setStep('status') }} style={{ width:'100%', marginBottom:8, padding:'16px', borderRadius:14, border:'1px solid ' + T.accent + '44', background: T.accent + '15', color:T.text, cursor:'pointer', textAlign:'left', display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontSize:26 }}>{s.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>{s.name}</div>
              <div style={{ fontSize:12, color:T.muted }}>{s.start}–{s.end}</div>
            </div>
            {st.late && <Tag c={T.orange}>SENT</Tag>}
          </button>
        )
      })}
    </Screen>
  )

  if (step === 'status') return (
    <Screen>
      <BackBtn onClick={() => filteredSess.length > 1 ? setStep('session') : setStep('name')}/>
      {miCheck && (
        <div style={{ width:'100%', padding:'9px 14px', borderRadius:9, marginBottom:12, background: miCheck.bg, border:'1.5px solid ' + miCheck.color, color:miCheck.color, fontSize:13, fontWeight:700 }}>
          {miCheck.label}
        </div>
      )}
      {sessState && sessState.late && sessState.minsIn > 0 && (
        <div style={{ width:'100%', padding:'9px 14px', borderRadius:9, marginBottom:12, background: T.orange + '18', border:'1.5px solid ' + T.orange, color:T.orange, fontSize:13, fontWeight:700 }}>
          ⏱ Sent – {Math.floor(sessState.minsIn)} min etter start
        </div>
      )}
      <div style={{ width:'100%', padding:'8px 14px', borderRadius:9, marginBottom:16, background: T.accent + '15', border:'1px solid ' + T.accent + '44', textAlign:'center', fontSize:13 }}>
        <span style={{ fontWeight:800, color:T.accentL }}>{session && session.icon} {session && session.name}</span>
        <span style={{ color:T.muted, marginLeft:8 }}>{session && session.start}–{session && session.end}</span>
      </div>
      <div style={{ fontSize:18, fontWeight:900, marginBottom:10 }}>
        Hei, {person && person.name.split(' ')[0]}!
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%', marginBottom:14 }}>
        {[
          { key:'attended', icon:'✅', label:'Deltar',            desc:'Fullt oppmøte',   color:T.green  },
          { key:'strength', icon:'💪', label:'Styrke/alternativ', desc:'Alternativ økt',  color:T.yellow },
          { key:'absent',   icon:'❌', label:'Melder fravær',     desc:'Kan ikke i dag',  color:T.red    },
        ].map(opt => (
          <button key={opt.key} onClick={() => setStatus(opt.key)} style={{ padding:'14px 16px', borderRadius:12, border:'2px solid ' + (status === opt.key ? opt.color : T.border), background: status === opt.key ? opt.color + '22' : T.card, color:T.text, cursor:'pointer', textAlign:'left', display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ fontSize:24 }}>{opt.icon}</span>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color: status === opt.key ? opt.color : T.text }}>{opt.label}</div>
              <div style={{ fontSize:11, color:T.muted }}>{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>
      {status === 'strength' && (
        <input value={injuryNote} onChange={e => setInj(e.target.value)} placeholder="Kommentar…" style={{ ...inputSt, marginBottom:10 }}/>
      )}
      {status && <BigBtn onClick={confirm}>BEKREFT →</BigBtn>}
    </Screen>
  )

  if (step === 'done') return (
    <Screen center>
      <SpartacusLogo size={60} showText={false}/>
      <div style={{ fontSize:22, fontWeight:900, color:T.green, marginBottom:4, marginTop:10 }}>
        {status === 'absent' ? 'Fravær registrert!' : 'Jobb hardt i dag! 💪'}
      </div>
      <div style={{ color:T.muted, marginBottom:2 }}>{person && person.name}</div>
      <div style={{ color:T.accent, fontWeight:700, marginBottom:20 }}>
        {session && session.icon} {session && session.name}
      </div>
      <BigBtn onClick={reset}>← Neste person</BigBtn>
    </Screen>
  )

  return null
}

// ═══════════════════════════════════════════════════════════
// SCHEDULE VIEW — horisontal
// ═══════════════════════════════════════════════════════════
function ScheduleView({ overrides }) {
  const today     = todayName()
  const now       = nowHHMM()
  const todayDate = todayISO()

  return (
    <div style={{ padding:'14px 10px', overflowX:'auto' }}>
      <div style={{ fontWeight:900, fontSize:18, marginBottom:14, textAlign:'center', color:T.accent, letterSpacing:2 }}>
        📅 SPARTACUS TIMEPLAN
      </div>
      <div style={{ display:'flex', gap:8, minWidth:'fit-content' }}>
        {DAYS_NO.map(day => {
          const isToday = day === today
          return (
            <div key={day} style={{ minWidth:150, flex:1, background:T.card, border:'1px solid ' + (isToday ? T.accent : T.border), borderRadius:14, overflow:'hidden', opacity: isToday ? 1 : 0.65 }}>
              <div style={{ padding:'10px 12px', background: isToday ? T.accent + '22' : 'transparent', textAlign:'center', borderBottom:'1px solid ' + T.border }}>
                <div style={{ fontWeight:900, fontSize:11, color: isToday ? T.accent : T.muted, textTransform:'uppercase', letterSpacing:1 }}>{day}</div>
                {isToday && <div style={{ fontSize:9, color:T.accent, fontWeight:800, marginTop:2 }}>I DAG</div>}
              </div>
              <div style={{ padding:8 }}>
                {SCHEDULE[day].map(s => {
                  const st          = isToday ? getSessionState(s, now) : null
                  const live        = st && st.open
                  const closed      = st && st.reason === 'closed_late'
                  const ov          = isToday ? overrides[ovKey(todayDate, s.name)] : null
                  const ovSt        = ov ? SESSION_STATUSES.find(x => x.key === ov.status) : null
                  const isCancelled = ov && ov.status !== 'normal' && ov.status !== 'open_mat'
                  return (
                    <div key={s.name} style={{ marginBottom:6, padding:'8px 10px', borderRadius:9, background: isCancelled ? T.red + '10' : live ? T.green + '18' : T.surface, border:'1px solid ' + (isCancelled ? T.red : live ? T.green : T.border) }}>
                      <div style={{ fontSize:14, marginBottom:2 }}>{ovSt ? ovSt.icon : s.icon}</div>
                      <div style={{ fontWeight:800, fontSize:12, color: isCancelled ? T.red : live ? T.green : T.text, lineHeight:1.2 }}>{s.name}</div>
                      <div style={{ fontSize:10, color:T.muted, marginTop:3 }}>{s.start}–{s.end}</div>
                      {isCancelled && <div style={{ fontSize:9, color:T.red, fontWeight:800, marginTop:2 }}>{ovSt && ovSt.label.toUpperCase()}</div>}
                      {!isCancelled && live && <div style={{ fontSize:9, color:T.green, fontWeight:800, marginTop:2 }}>● ÅPEN</div>}
                      {!isCancelled && closed && <div style={{ fontSize:9, color:T.red, fontWeight:800, marginTop:2 }}>⛔ STENGT</div>}
                      {ov && ov.note && <div style={{ fontSize:9, color:T.muted, marginTop:2, fontStyle:'italic' }}>{ov.note}</div>}
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

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
function Dashboard({ members, setMembers, attendance, auth, setAuth, editAtt, delAtt, syncMI, miSt, overrides, saveOverrides, onAdd, fakturaer, setFakturaer, spesial, saveSpesial }) {
  const [tab, setTab]     = useState('overview')
  const [loginUser, setLU]= useState('')
  const [loginPass, setLP]= useState('')
  const [loginErr, setLE] = useState('')

  function handleLogin() {
    if (loginUser.toLowerCase().trim() === 'coach' && loginPass === 'Spartacus#2023') {
      setAuth(true); setLE('')
    } else {
      setLE('Feil brukernavn eller passord')
    }
  }

  const statusCounts = useMemo(() => {
    const athletes = members.filter(m => !m.isCoach)
    return {
      active:      athletes.filter(m => getMiStatus(m) === 'active').length,
      forfalt:     fakturaer.filter(f => f.betalingStatus === 'forfalt').length,
      purret:      fakturaer.filter(f => f.betalingStatus === 'purret').length,
      inkasso:     fakturaer.filter(f => f.betalingStatus === 'inkasso').length,
      fritidskort: athletes.filter(m => m.fritidskort && getFritidskortstatus(m) && getFritidskortstatus(m).active).length,
      junior:      athletes.filter(m => isJunior(m)).length,
      senior:      athletes.filter(m => !isJunior(m) && m.birthDate).length,
    }
  }, [members, fakturaer])

  if (!auth) return (
    <Screen center>
      <SpartacusLogo size={56} showText/>
      <div style={{ marginTop:16, width:'100%' }}>
        <div style={{ fontSize:18, fontWeight:900, marginBottom:10 }}>Admin-innlogging</div>
        <input placeholder="Brukernavn" value={loginUser} onChange={e => setLU(e.target.value)} style={{ ...inputSt, marginBottom:8 }} autoComplete="username"/>
        <input type="password" placeholder="Passord" value={loginPass} onChange={e => setLP(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ ...inputSt, marginBottom:10 }} autoComplete="current-password"/>
        {loginErr && <div style={{ color:T.red, fontSize:13, marginBottom:10 }}>{loginErr}</div>}
        <BigBtn onClick={handleLogin}>Logg inn</BigBtn>
        <div style={{ marginTop:8, color:T.muted, fontSize:11, textAlign:'center' }}>Demo: coach / Spartacus#2023</div>
      </div>
    </Screen>
  )

  const tabs = [
    { key:'overview',  label:'📊 Oversikt'   },
    { key:'members',   label:'👥 Utøvere'    },
    { key:'register',  label:'✅ Registrer'  },
    { key:'log',       label:'📋 Logg'       },
    { key:'schedule',  label:'📅 Timeplan'   },
    { key:'faktura',   label:'🧾 Faktura'    },
    { key:'sms',       label:'📱 SMS'        },
    { key:'manage',    label:'⚙️ Administrer'},
  ]

  return (
    <div style={{ padding:'12px', maxWidth:1100, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'7px 10px', borderRadius:9, border:'1px solid ' + (tab === t.key ? T.accent : T.border), background: tab === t.key ? T.accent : 'transparent', color: tab === t.key ? '#fff' : T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setAuth(false)} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>
          Logg ut
        </button>
      </div>

      <StatusBar counts={statusCounts}/>

      {tab === 'overview'  && <OverviewTab  members={members} attendance={attendance} fakturaer={fakturaer}/>}
      {tab === 'members'   && <MembersTab   members={members} setMembers={setMembers} spesial={spesial} saveSpesial={saveSpesial}/>}
      {tab === 'register'  && <RegisterTab  members={members} onAdd={onAdd}/>}
      {tab === 'log'       && <LogTab       attendance={attendance} editAtt={editAtt} delAtt={delAtt}/>}
      {tab === 'schedule'  && <ScheduleAdminTab overrides={overrides} saveOverrides={saveOverrides}/>}
      {tab === 'faktura'   && <FakturaTab   members={members} fakturaer={fakturaer} setFakturaer={setFakturaer}/>}
      {tab === 'sms'       && <SmsTab       members={members} attendance={attendance}/>}
      {tab === 'manage'    && <ManageTab    members={members} setMembers={setMembers} syncMI={syncMI} miSt={miSt}/>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════
function OverviewTab({ members, attendance, fakturaer }) {
  const [period, setPeriod] = useState(30)
  const cutoff    = daysAgo(period)
  const periodLog = attendance.filter(a => a.date >= cutoff)
  const todayLog  = attendance.filter(a => a.date === todayISO())
  const weekLog   = attendance.filter(a => a.date >= daysAgo(7))
  const athletes  = members.filter(m => !m.isCoach)

  const stats = useMemo(() => athletes.map(m => {
    const logs = periodLog.filter(a => a.memberId === m.id)
    const att  = logs.filter(a => a.status !== 'absent').length
    return { ...m, elig: calcElig(att, logs.length) }
  }), [athletes, periodLog])

  const weekBars = useMemo(() => Array.from({ length:8 }, (_, i) => ({
    c: attendance.filter(a => a.date >= daysAgo((8-i)*7) && a.date < daysAgo((7-i)*7) && a.status !== 'absent').length
  })), [attendance])
  const maxBar = Math.max(...weekBars.map(w => w.c), 1)

  const fkCounts = useMemo(() => {
    return {
      ikkeForfalt: fakturaer.filter(f => f.betalingStatus === 'ikke_forfalt').length,
      forfalt:     fakturaer.filter(f => f.betalingStatus === 'forfalt').length,
      purret:      fakturaer.filter(f => f.betalingStatus === 'purret').length,
      inkasso:     fakturaer.filter(f => f.betalingStatus === 'inkasso').length,
    }
  }, [fakturaer])

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontWeight:900, fontSize:16 }}>Oversikt</div>
        <select value={period} onChange={e => setPeriod(+e.target.value)} style={selSt}>
          <option value={7}>7d</option><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option>
        </select>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:8, marginBottom:14 }}>
        {[
          { n: todayLog.length,                                          l:'Innsjekk i dag',  c:T.accent  },
          { n: weekLog.length,                                           l:'Uka totalt',       c:T.blue    },
          { n: stats.filter(s => s.elig.label === 'Kampklar').length,   l:'Kampklare 🟢',    c:T.green   },
          { n: athletes.filter(m => isJunior(m)).length,                l:'Junior 🧒',        c:T.blue    },
          { n: fkCounts.forfalt + fkCounts.purret,                       l:'Forfalt/purret',  c:T.yellow  },
          { n: fkCounts.inkasso,                                         l:'Inkasso ⛔',       c:T.red     },
        ].map(({ n, l, c }) => (
          <div key={l} style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:12, padding:'12px 8px', textAlign:'center' }}>
            <div style={{ fontSize:24, fontWeight:900, color:c, lineHeight:1 }}>{n}</div>
            <div style={{ fontSize:9, color:T.muted, marginTop:4, fontWeight:700, textTransform:'uppercase', lineHeight:1.3 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', marginBottom:12 }}>Oppmøte uke for uke</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:70 }}>
          {weekBars.map((w, i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
              <div style={{ width:'100%', background: T.accent + 'cc', borderRadius:'4px 4px 0 0', height: (w.c/maxBar)*56 + 'px', minHeight:3 }}/>
              <span style={{ fontSize:9, color:T.muted }}>U{i+1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MEMBERS TAB
// ═══════════════════════════════════════════════════════════
function MembersTab({ members, setMembers, spesial, saveSpesial }) {
  const [search, setSrch]     = useState('')
  const [filter, setFilter]   = useState('alle')
  const [editingFk, setEditFk]= useState(null)
  const [fkDate, setFkDate]   = useState(todayISO())
  const [detail, setDetail]   = useState(null)

  const athletes = members.filter(m => !m.isCoach)
  const filtered = useMemo(() => {
    let r = athletes
    if (search.trim()) r = r.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    if (filter === 'junior')       r = r.filter(m => isJunior(m))
    if (filter === 'senior')       r = r.filter(m => !isJunior(m) && m.birthDate)
    if (filter === 'fritidskort')  r = r.filter(m => m.fritidskort && getFritidskortstatus(m) && getFritidskortstatus(m).active)
    if (filter === 'spesialavtale')r = r.filter(m => spesial[m.id])
    if (filter === 'inkasso')      r = r.filter(m => getMiStatus(m) === 'inkasso')
    return r
  }, [athletes, search, filter, spesial])

  function saveFk(member) {
    const updated = members.map(m => m.id === member.id ? { ...m, fritidskort: { startDate: fkDate, value: FRITIDSKORT_VALUE } } : m)
    setMembers(updated)
    lsSet(LS_MEMBERS, updated)
    setEditFk(null)
  }

  function removeFk(member) {
    const updated = members.map(m => m.id === member.id ? { ...m, fritidskort: null } : m)
    setMembers(updated)
    lsSet(LS_MEMBERS, updated)
    setEditFk(null)
  }

  function toggleSpesial(id) {
    const updated = { ...spesial }
    if (updated[id]) delete updated[id]
    else updated[id] = { note:'Spesialavtale', since: todayISO() }
    saveSpesial(updated)
  }

  return (
    <div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        <input placeholder="🔍 Søk…" value={search} onChange={e => setSrch(e.target.value)} style={{ flex:1, minWidth:120, padding:'8px 12px', borderRadius:9, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
      </div>

      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:800, color:T.muted, textTransform:'uppercase', marginBottom:8 }}>Filter</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {[{k:'alle',l:'Alle'},{k:'junior',l:'🧒 Junior'},{k:'senior',l:'👤 Senior'},{k:'fritidskort',l:'🎫 Fritidskort'},{k:'spesialavtale',l:'⭐ Spesialavtale'},{k:'inkasso',l:'⛔ Inkasso'}].map(b => (
            <button key={b.k} onClick={() => setFilter(b.k)} style={{ padding:'6px 12px', borderRadius:99, border:'1px solid ' + (filter === b.k ? T.accent : T.border), background: filter === b.k ? T.accent : 'transparent', color: filter === b.k ? '#fff' : T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>
              {b.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden' }}>
        {filtered.length === 0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen funnet</div>}
        {filtered.map((m, i) => {
          const junior = isJunior(m)
          const fk     = getFritidskortstatus(m)
          const sa     = spesial[m.id]
          const miSt   = getMiStatus(m)
          const stColor= { active:T.green, expired:T.yellow, inkasso:T.red, unpaid:T.yellow, not_member:T.muted }[miSt] || T.muted
          const stLabel= { active:'Aktiv', expired:'Utløpt', inkasso:'Inkasso', unpaid:'Ubetalt', not_member:'Ikke medlem' }[miSt] || '–'
          return (
            <div key={m.id} style={{ padding:'11px 14px', borderBottom: i < filtered.length-1 ? '1px solid ' + T.border : 'none', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <Avatar name={m.name} size={30}/>
              <div style={{ flex:1, minWidth:100 }}>
                <div style={{ fontWeight:700, fontSize:13, display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                  {m.name}
                  {junior && <Tag c={T.blue}>Junior{m.birthDate ? ' (' + getAge(m.birthDate) + 'år)' : ''}</Tag>}
                  {!junior && m.birthDate && <Tag c={T.gold}>Senior</Tag>}
                  {fk && fk.active && <Tag c={T.purple}>🎫 FK</Tag>}
                  {sa && <Tag c={T.orange}>⭐</Tag>}
                </div>
                <div style={{ fontSize:11, color:T.muted }}>{m.phone || '–'} · {m.disc}</div>
              </div>
              <Tag c={stColor}>{stLabel}</Tag>
              <div style={{ display:'flex', gap:5 }}>
                <button onClick={() => setDetail(m)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid ' + T.blue + '44', background: T.blue + '15', color:T.blue, cursor:'pointer', fontSize:11, fontWeight:800 }}>👁</button>
                <button onClick={() => { setEditFk(m); setFkDate(m.fritidskort ? m.fritidskort.startDate : todayISO()) }} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid ' + T.purple + '44', background: T.purple + '15', color:T.purple, cursor:'pointer', fontSize:11, fontWeight:800 }}>🎫</button>
                <button onClick={() => toggleSpesial(m.id)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid ' + T.orange + '44', background: sa ? T.orange + '25' : T.orange + '10', color:T.orange, cursor:'pointer', fontSize:11, fontWeight:800 }}>{sa ? '⭐' : '☆'}</button>
              </div>
            </div>
          )
        })}
      </div>

      {editingFk && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:20, padding:24, maxWidth:380, width:'100%' }}>
            <div style={{ fontWeight:900, fontSize:16, marginBottom:4 }}>🎫 Fritidskort</div>
            <div style={{ color:T.muted, fontSize:13, marginBottom:14 }}>{editingFk.name}</div>
            {editingFk.fritidskort && (() => {
              const fk = getFritidskortstatus(editingFk)
              return (
                <div style={{ padding:'10px 14px', borderRadius:9, background: fk && fk.active ? T.green + '15' : T.yellow + '15', border:'1px solid ' + (fk && fk.active ? T.green : T.yellow) + '44', color: fk && fk.active ? T.green : T.yellow, fontSize:12, marginBottom:14 }}>
                  {fk && fk.active ? '✅ Aktivt til ' + fk.endDate + ' (' + fk.daysLeft + ' dager)' : '⚠️ Utløpt'}
                </div>
              )
            })()}
            <div style={{ fontSize:11, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>Startdato</div>
            <input type="date" value={fkDate} onChange={e => setFkDate(e.target.value)} style={{ ...inputSt, marginBottom:10 }}/>
            <div style={{ fontSize:11, color:T.muted, marginBottom:14 }}>
              Verdi: <strong style={{ color:T.purple }}>{FRITIDSKORT_VALUE} kr</strong> · Gjelder {FRITIDSKORT_MONTHS} mnd
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => saveFk(editingFk)} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:T.purple, color:'#fff', fontWeight:900, cursor:'pointer', fontSize:14 }}>💾 Aktiver</button>
              {editingFk.fritidskort && <button onClick={() => removeFk(editingFk)} style={{ padding:'12px', borderRadius:10, border:'1px solid ' + T.red + '44', background: T.red + '15', color:T.red, cursor:'pointer', fontSize:13, fontWeight:800 }}>Fjern</button>}
              <button onClick={() => setEditFk(null)} style={{ padding:'12px 16px', borderRadius:10, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer' }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:20, padding:24, maxWidth:420, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <Avatar name={detail.name} size={44}/>
                <div>
                  <div style={{ fontWeight:900, fontSize:16 }}>{detail.name}</div>
                  <div style={{ fontSize:12, color:T.muted }}>{isJunior(detail) ? 'Junior' : 'Senior'}{detail.birthDate ? ' · ' + getAge(detail.birthDate) + ' år' : ''}</div>
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <div style={{ background:T.surface, border:'1px solid ' + T.border, borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontWeight:800, fontSize:12, color:T.accent, marginBottom:8 }}>🔒 Privat — kun admin</div>
              {[
                ['E-post',      detail.email     || '–'],
                ['Telefon',     detail.phone     || '–'],
                ['Adresse',     detail.address   || '–'],
                ['Fødselsdato', detail.birthDate || '–'],
                ['Kjønn',       detail.gender    || '–'],
                ['Avgift',      isJunior(detail) ? 'Junior – ' + JUNIOR_AVGIFT + ' kr/mnd' : 'Senior – ' + SENIOR_AVGIFT + ' kr/mnd'],
              ].map(([l, v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid ' + T.border, fontSize:12 }}>
                  <span style={{ color:T.muted }}>{l}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setDetail(null)} style={{ width:'100%', padding:'11px', borderRadius:10, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontWeight:800 }}>Lukk</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// REGISTER TAB
// ═══════════════════════════════════════════════════════════
function RegisterTab({ members, onAdd }) {
  const [selDate, setSD]   = useState(todayISO())
  const [selSess, setSess] = useState('')
  const [selMs, setSelMs]  = useState([])
  const [bulkSt, setBulk]  = useState('attended')
  const [search, setSQ]    = useState('')
  const [saved, setSaved]  = useState(false)

  const dayName  = DAYS_NO[new Date(selDate).getDay() === 0 ? 6 : new Date(selDate).getDay()-1]
  const sessions = SCHEDULE[dayName] || []
  const athletes = members.filter(m => !m.isCoach).filter(m => !search.trim() || m.name.toLowerCase().includes(search.toLowerCase()))

  function toggle(id) {
    setSelMs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  function registerAll() {
    const sess = sessions.find(s => s.name === selSess)
    if (!sess || selMs.length === 0) return
    selMs.forEach(id => {
      const m = members.find(x => x.id === id)
      if (!m) return
      onAdd({
        memberId: m.id, memberName: m.name,
        date: selDate, day: dayName,
        session: sess.name, disc: sess.disc,
        status: bulkSt, isLate: false, lateMinutes: 0,
        injuryNote: null, registeredAt: sess.start,
        miStatus: getMiStatus(m), isGuest: false,
        isCoach: m.isCoach, registeredByAdmin: true,
      })
    })
    setSelMs([]); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <div style={{ fontWeight:900, fontSize:16, marginBottom:12 }}>✅ Manuell registrering</div>
      {saved && <div style={{ padding:'9px 14px', borderRadius:9, background: T.green + '15', border:'1px solid ' + T.green + '44', color:T.green, fontWeight:800, marginBottom:10 }}>✅ Registrert!</div>}
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>1️⃣ Dato og time</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input type="date" value={selDate} onChange={e => setSD(e.target.value)} style={{ flex:1, ...inputSt }}/>
          <select value={selSess} onChange={e => setSess(e.target.value)} style={{ flex:2, ...selSt, fontSize:13, padding:'11px 14px' }}>
            <option value="">– Velg time –</option>
            {sessions.map(s => <option key={s.name} value={s.name}>{s.icon} {s.name} ({s.start})</option>)}
          </select>
        </div>
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>2️⃣ Status</div>
        <div style={{ display:'flex', gap:6 }}>
          {[{key:'attended',icon:'✅',label:'Deltar',c:T.green},{key:'strength',icon:'💪',label:'Styrke',c:T.yellow},{key:'absent',icon:'❌',label:'Fravær',c:T.red}].map(o => (
            <button key={o.key} onClick={() => setBulk(o.key)} style={{ flex:1, padding:'10px', borderRadius:9, border:'2px solid ' + (bulkSt === o.key ? o.c : T.border), background: bulkSt === o.key ? o.c + '18' : T.surface, color: o.c, cursor:'pointer', fontWeight:800, fontSize:12 }}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>3️⃣ Velg utøvere</div>
        <input placeholder="🔍 Søk…" value={search} onChange={e => setSQ(e.target.value)} style={{ ...inputSt, marginBottom:8 }}/>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <button onClick={() => setSelMs(members.filter(m => !m.isCoach).map(m => m.id))} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:12, fontWeight:800 }}>Velg alle</button>
          <button onClick={() => setSelMs([])} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:12 }}>Fjern</button>
        </div>
        <div style={{ maxHeight:220, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
          {athletes.map(m => {
            const sel = selMs.includes(m.id)
            return (
              <button key={m.id} onClick={() => toggle(m.id)} style={{ padding:'9px 11px', borderRadius:9, border:'2px solid ' + (sel ? T.green : T.border), background: sel ? T.green + '15' : T.surface, color:T.text, cursor:'pointer', display:'flex', alignItems:'center', gap:8, textAlign:'left' }}>
                <div style={{ width:16, height:16, borderRadius:4, border:'2px solid ' + (sel ? T.green : T.dim), background: sel ? T.green : 'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {sel && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                </div>
                <Avatar name={m.name} size={24}/>
                <span style={{ flex:1, fontWeight:700, fontSize:13 }}>{m.name}</span>
                {isJunior(m) && <Tag c={T.blue}>Junior</Tag>}
              </button>
            )
          })}
        </div>
      </div>
      <BigBtn onClick={registerAll} disabled={!selSess || selMs.length === 0}>
        ✅ Registrer {selMs.length} utøver{selMs.length !== 1 ? 'e' : ''}
      </BigBtn>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// LOG TAB
// ═══════════════════════════════════════════════════════════
function LogTab({ attendance, editAtt, delAtt }) {
  const [editing, setEditing]  = useState(null)
  const [eStatus, setES]       = useState('attended')
  const [eNote, setEN]         = useState('')
  const [confirmDel, setConf]  = useState(null)
  const [fDate, setFD]         = useState(todayISO())
  const [search, setSrch]      = useState('')

  const filtered = useMemo(() => {
    let r = attendance
    if (fDate)         r = r.filter(a => a.date === fDate)
    if (search.trim()) r = r.filter(a => a.memberName.toLowerCase().includes(search.toLowerCase()))
    return [...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)
  }, [attendance, fDate, search])

  const sColor = s => s === 'attended' ? T.green : s === 'strength' ? T.yellow : T.red
  const sLabel = s => s === 'attended' ? 'Deltar' : s === 'strength' ? 'Styrke' : 'Fravær'

  return (
    <div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        <input type="date" value={fDate} onChange={e => setFD(e.target.value)} style={{ padding:'7px 10px', borderRadius:9, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none' }}/>
        <input placeholder="🔍 Navn…" value={search} onChange={e => setSrch(e.target.value)} style={{ flex:1, minWidth:100, padding:'7px 10px', borderRadius:9, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none' }}/>
        <button onClick={() => setFD('')} style={{ padding:'7px 11px', borderRadius:9, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:11 }}>Vis alle</button>
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden' }}>
        {filtered.length === 0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen registreringer</div>}
        {filtered.map(a => (
          <div key={a.id}>
            <div style={{ padding:'10px 13px', borderBottom:'1px solid ' + T.border, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <Avatar name={a.memberName} size={28}/>
              <div style={{ flex:1, minWidth:80 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>
                  {a.memberName}
                  {a.isLate && <span style={{ marginLeft:6 }}><Tag c={T.orange}>⏱</Tag></span>}
                  {a.registeredByAdmin && <span style={{ marginLeft:4 }}><Tag c={T.blue}>Admin</Tag></span>}
                </div>
                <div style={{ fontSize:10, color:T.muted }}>{a.session} · {a.date} {a.registeredAt}</div>
              </div>
              <Tag c={sColor(a.status)}>{sLabel(a.status)}</Tag>
              <div style={{ display:'flex', gap:4 }}>
                <button onClick={() => { setEditing(a.id); setES(a.status); setEN(a.injuryNote || ''); setConf(null) }} style={{ padding:'4px 8px', borderRadius:7, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:11 }}>✏️</button>
                <button onClick={() => { setConf(a.id); setEditing(null) }} style={{ padding:'4px 8px', borderRadius:7, border:'1px solid ' + T.border, background:'transparent', color:T.red, cursor:'pointer', fontSize:11 }}>🗑</button>
              </div>
            </div>
            {editing === a.id && (
              <div style={{ padding:'10px 13px', background: T.accent + '10', borderBottom:'1px solid ' + T.border, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <select value={eStatus} onChange={e => setES(e.target.value)} style={{ padding:'6px 8px', borderRadius:8, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none' }}>
                  <option value="attended">Deltar</option>
                  <option value="strength">Styrke</option>
                  <option value="absent">Fravær</option>
                </select>
                <input value={eNote} onChange={e => setEN(e.target.value)} placeholder="Kommentar…" style={{ flex:1, padding:'6px 8px', borderRadius:8, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none' }}/>
                <button onClick={() => { editAtt(a.id, { status: eStatus, injuryNote: eNote || null }); setEditing(null) }} style={{ padding:'6px 11px', borderRadius:8, border:'none', background:T.green, color:'#fff', fontWeight:800, cursor:'pointer', fontSize:12 }}>Lagre</button>
                <button onClick={() => setEditing(null)} style={{ padding:'6px 11px', borderRadius:8, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:12 }}>Avbryt</button>
              </div>
            )}
            {confirmDel === a.id && (
              <div style={{ padding:'9px 13px', background: T.red + '18', borderBottom:'1px solid ' + T.border, display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ flex:1, fontSize:12, color:T.red, fontWeight:700 }}>Slett?</span>
                <button onClick={() => { delAtt(a.id); setConf(null) }} style={{ padding:'5px 11px', borderRadius:8, border:'none', background:T.red, color:'#fff', fontWeight:800, cursor:'pointer', fontSize:11 }}>Slett</button>
                <button onClick={() => setConf(null)} style={{ padding:'5px 11px', borderRadius:8, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:11 }}>Avbryt</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// SCHEDULE ADMIN TAB
// ═══════════════════════════════════════════════════════════
function ScheduleAdminTab({ overrides, saveOverrides }) {
  const [selDate, setSD]    = useState(todayISO())
  const [editing, setEd]    = useState(null)
  const [newStatus, setNS]  = useState('cancelled')
  const [newNote, setNN]    = useState('')

  const dayName = DAYS_NO[new Date(selDate).getDay() === 0 ? 6 : new Date(selDate).getDay()-1]
  const sessions= SCHEDULE[dayName] || []

  function save() {
    const k = ovKey(selDate, editing.name)
    const updated = { ...overrides, [k]: { status: newStatus, note: newNote.trim(), setAt: new Date().toISOString() } }
    saveOverrides(updated)
    setEd(null)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontWeight:900, fontSize:16 }}>📅 Timeplan-admin</div>
        <input type="date" value={selDate} onChange={e => setSD(e.target.value)} style={{ padding:'8px 12px', borderRadius:9, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:13, outline:'none' }}/>
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden', marginBottom:12 }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid ' + T.border, fontWeight:800, fontSize:13, color:T.accent }}>
          {dayName} · {selDate}
        </div>
        {sessions.length === 0 && <div style={{ padding:20, color:T.muted, textAlign:'center' }}>Ingen timer</div>}
        {sessions.map(s => {
          const k    = ovKey(selDate, s.name)
          const ov   = overrides[k]
          const ovSt = ov ? SESSION_STATUSES.find(x => x.key === ov.status) : null
          return (
            <div key={s.name} style={{ padding:'11px 14px', borderBottom:'1px solid ' + T.border, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>{ovSt ? ovSt.icon : s.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700 }}>{s.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{s.start}–{s.end}{ov && ov.note ? ' · ' + ov.note : ''}</div>
              </div>
              {ov && ov.status !== 'normal' ? <Tag c={ovSt ? ovSt.color : T.muted}>{ovSt ? ovSt.label : ov.status}</Tag> : <Tag c={T.green}>Normal</Tag>}
              <button onClick={() => { setEd(s); setNS(ov ? ov.status : 'cancelled'); setNN(ov ? ov.note || '' : '') }} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid ' + T.accent + '44', background: T.accent + '15', color:T.accent, cursor:'pointer', fontSize:12, fontWeight:800 }}>
                ✏️ Endre
              </button>
              {ov && ov.status !== 'normal' && (
                <button onClick={() => { const u = { ...overrides }; delete u[k]; saveOverrides(u) }} style={{ padding:'6px 8px', borderRadius:8, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer', fontSize:11 }}>↩</button>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:20, padding:24, maxWidth:420, width:'100%' }}>
            <div style={{ fontWeight:900, fontSize:16, marginBottom:14 }}>✏️ {editing.name} · {selDate}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
              {SESSION_STATUSES.map(st => (
                <button key={st.key} onClick={() => setNS(st.key)} style={{ padding:'11px', borderRadius:10, border:'2px solid ' + (newStatus === st.key ? st.color : T.border), background: newStatus === st.key ? st.color + '18' : T.surface, color: newStatus === st.key ? st.color : T.text, cursor:'pointer', fontWeight:800, fontSize:12, display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                  <span style={{ fontSize:18 }}>{st.icon}</span>{st.label}
                </button>
              ))}
            </div>
            <input value={newNote} onChange={e => setNN(e.target.value)} placeholder="Notat (valgfritt)…" style={{ ...inputSt, marginBottom:12 }}/>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:T.accent, color:'#fff', fontWeight:900, cursor:'pointer' }}>💾 Lagre</button>
              <button onClick={() => setEd(null)} style={{ padding:'12px 16px', borderRadius:10, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer' }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// FAKTURA TAB
// ═══════════════════════════════════════════════════════════
function FakturaTab({ members, fakturaer, setFakturaer }) {
  const [step, setStep]       = useState('liste')
  const [fakturaNr]           = useState(genNr)
  const [mottaker, setMott]   = useState('member')
  const [valgtM, setValgtM]   = useState('')
  const [fritekstN, setFTN]   = useState('')
  const [fritekstE, setFTE]   = useState('')
  const [linjer, setLinjer]   = useState([{ id:1, beskrivelse:'', antall:1, enhet:'stk', pris:'' }])
  const [forfall, setForfall] = useState(daysFromNow(14))
  const [notat, setNotat]     = useState('')
  const [filterSt, setFilterSt] = useState('alle')
  const [searchQ, setSQ]      = useState('')
  const [masseSending, setMasse] = useState(false)
  const [masseRes, setMasseRes] = useState(null)

  const athletes     = members.filter(m => !m.isCoach)
  const saveFakt     = list => { lsSet(LS_FAKTURAER, list); setFakturaer(list) }

  const subtotal = linjer.reduce((s, l) => s + (parseFloat(l.pris)||0) * (parseInt(l.antall)||0), 0)
  const mva      = Math.round(subtotal * 0.25)
  const total    = subtotal + mva

  const bsColor = { ikke_forfalt:T.green, forfalt:T.yellow, purret:T.orange, inkasso:T.red, betalt:T.green }
  const bsLabel = { ikke_forfalt:'Ikke forfalt', forfalt:'Forfalt', purret:'Purret', inkasso:'Inkasso', betalt:'Betalt' }

  function sendMasse() {
    setMasse(true)
    const today   = todayISO()
    const newFakt = [...fakturaer]
    let count     = 0
    athletes.forEach(m => {
      const already = newFakt.some(f => f.memberId === m.id && f.dato === today && f.autoSent)
      if (already) return
      const fk    = getFritidskortstatus(m)
      const junior= isJunior(m)
      const avgift= (fk && fk.active) ? 0 : (junior ? JUNIOR_AVGIFT : SENIOR_AVGIFT)
      if (avgift === 0) return
      newFakt.unshift({
        id: genNr(), memberId: m.id, mottaker: m.name, epost: m.email || '',
        linjer: [{ id: Date.now() + Math.random(), beskrivelse: 'Treningsavgift ' + (junior ? 'junior' : 'senior'), antall:1, enhet:'mnd', pris:avgift }],
        subtotal: avgift, mva: Math.round(avgift*0.25), total: avgift + Math.round(avgift*0.25),
        forfall: daysFromNow(14), notat:'', dato: today,
        status:'ikke_forfalt', betalingStatus:'ikke_forfalt', autoSent:true, isJunior: junior,
      })
      count++
    })
    saveFakt(newFakt)
    setMasseRes(count)
    setMasse(false)
    setTimeout(() => setMasseRes(null), 4000)
  }

  function sendPurringer() {
    const updated = fakturaer.map(f => {
      if (f.betalingStatus === 'forfalt') return { ...f, betalingStatus:'purret' }
      return f
    })
    saveFakt(updated)
  }

  function sendFaktura() {
    const m    = mottaker === 'member' ? athletes.find(x => x.id === valgtM) : { name: fritekstN, email: fritekstE }
    if (!m) return
    const ny = {
      id: fakturaNr, memberId: mottaker === 'member' ? valgtM : null,
      mottaker: m.name, epost: m.email || '',
      linjer: linjer.filter(l => l.beskrivelse.trim()),
      subtotal, mva, total, forfall, notat,
      dato: todayISO(), status:'ikke_forfalt', betalingStatus:'ikke_forfalt', autoSent:false,
    }
    saveFakt([ny, ...fakturaer])
    setStep('liste')
  }

  const visF = fakturaer.filter(f => {
    if (filterSt !== 'alle' && f.betalingStatus !== filterSt) return false
    if (searchQ.trim() && !f.mottaker.toLowerCase().includes(searchQ.toLowerCase()) && !f.id.includes(searchQ)) return false
    return true
  })

  if (step === 'ny') return (
    <div>
      <BackBtn onClick={() => setStep('liste')}/>
      <div style={{ fontWeight:900, fontSize:16, marginBottom:14 }}>🧾 Ny faktura · <span style={{ color:T.accent }}>{fakturaNr}</span></div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>1️⃣ Mottaker</div>
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {[{k:'member',l:'Fra liste'},{k:'fritekst',l:'Skriv inn'}].map(o => (
            <button key={o.k} onClick={() => setMott(o.k)} style={{ flex:1, padding:'10px', borderRadius:9, border:'2px solid ' + (mottaker === o.k ? T.accent : T.border), background: mottaker === o.k ? T.accent + '15' : T.surface, color:T.text, cursor:'pointer', fontWeight:800, fontSize:13 }}>{o.l}</button>
          ))}
        </div>
        {mottaker === 'member' ? (
          <select value={valgtM} onChange={e => setValgtM(e.target.value)} style={{ width:'100%', padding:'11px 14px', borderRadius:10, border:'2px solid ' + (valgtM ? T.accent : T.border), background:T.surface, color:T.text, fontSize:14, outline:'none' }}>
            <option value="">– Velg utøver –</option>
            {athletes.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} {isJunior(m) ? '(junior ' + JUNIOR_AVGIFT + 'kr)' : '(senior ' + SENIOR_AVGIFT + 'kr)'}
                {getFritidskortstatus(m) && getFritidskortstatus(m).active ? ' – Fritidskort' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input placeholder="Navn *" value={fritekstN} onChange={e => setFTN(e.target.value)} style={inputSt}/>
            <input placeholder="E-post" value={fritekstE} onChange={e => setFTE(e.target.value)} style={inputSt}/>
          </div>
        )}
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>2️⃣ Linjer</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
          {FAKTURA_KATEGORIER.map(k => (
            <button key={k} onClick={() => setLinjer(p => [...p, { id: Date.now() + Math.random(), beskrivelse:k, antall:1, enhet:'stk', pris:'' }])} style={{ padding:'5px 10px', borderRadius:99, border:'1px solid ' + T.border, background:T.surface, color:T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
              + {k}
            </button>
          ))}
        </div>
        {linjer.map(l => {
          const sum = (parseFloat(l.pris)||0) * (parseInt(l.antall)||0)
          return (
            <div key={l.id} style={{ display:'flex', gap:6, marginBottom:6, alignItems:'center' }}>
              <input value={l.beskrivelse} onChange={e => setLinjer(p => p.map(x => x.id === l.id ? { ...x, beskrivelse: e.target.value } : x))} placeholder="Beskrivelse" style={{ ...inputSt, flex:3 }}/>
              <input type="number" value={l.antall} onChange={e => setLinjer(p => p.map(x => x.id === l.id ? { ...x, antall: e.target.value } : x))} style={{ ...inputSt, width:50, textAlign:'center' }}/>
              <input type="number" value={l.pris} onChange={e => setLinjer(p => p.map(x => x.id === l.id ? { ...x, pris: e.target.value } : x))} placeholder="Kr" style={{ ...inputSt, width:70, textAlign:'right' }}/>
              <span style={{ color:T.green, fontWeight:800, fontSize:12, minWidth:50 }}>{sum > 0 ? sum + ' kr' : '–'}</span>
              {linjer.length > 1 && (
                <button onClick={() => setLinjer(p => p.filter(x => x.id !== l.id))} style={{ background:'none', border:'none', color:T.red, cursor:'pointer', fontSize:16 }}>×</button>
              )}
            </div>
          )
        })}
        <button onClick={() => setLinjer(p => [...p, { id: Date.now() + Math.random(), beskrivelse:'', antall:1, enhet:'stk', pris:'' }])} style={{ padding:'8px', borderRadius:9, border:'1px dashed ' + T.accent, background: T.accent + '10', color:T.accent, cursor:'pointer', fontSize:12, width:'100%', marginTop:6 }}>
          + Legg til linje
        </button>
        {subtotal > 0 && (
          <div style={{ marginTop:12, borderTop:'1px solid ' + T.border, paddingTop:10 }}>
            {[{l:'Subtotal',v:subtotal + ' kr'},{l:'MVA 25%',v:mva + ' kr'},{l:'TOTALT',v:total + ' kr',bold:true}].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize: r.bold ? 15 : 13 }}>
                <span style={{ color: r.bold ? T.text : T.muted, fontWeight: r.bold ? 900 : 500 }}>{r.l}</span>
                <span style={{ color: r.bold ? T.green : T.muted, fontWeight: r.bold ? 900 : 500 }}>{r.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:14 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>3️⃣ Detaljer</div>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Forfallsdato</div>
            <input type="date" value={forfall} onChange={e => setForfall(e.target.value)} style={inputSt}/>
          </div>
        </div>
        <input placeholder="Notat (f.eks. kontonummer)" value={notat} onChange={e => setNotat(e.target.value)} style={inputSt}/>
      </div>
      <BigBtn onClick={sendFaktura} disabled={!(mottaker === 'member' ? valgtM : fritekstN.trim()) || !linjer.some(l => l.beskrivelse.trim() && l.pris)}>
        🧾 Send faktura{total > 0 ? ' – ' + total + ' kr' : ''}
      </BigBtn>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:16 }}>🧾 Faktura</div>
          <div style={{ fontSize:12, color:T.muted }}>Neste auto-utsendelse: <strong style={{ color:T.green }}>{getNextFakturaDate()}</strong> (2. mandag)</div>
        </div>
        <button onClick={() => setStep('ny')} style={{ padding:'10px 18px', borderRadius:10, border:'none', background:T.accent, color:'#fff', fontWeight:900, fontSize:13, cursor:'pointer' }}>+ Ny faktura</button>
      </div>

      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>🤖 Automatikk</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={sendMasse} disabled={masseSending} style={{ padding:'12px', borderRadius:10, border:'1px solid ' + T.green + '55', background: T.green + '15', color:T.green, cursor:'pointer', fontWeight:800, fontSize:13 }}>
            {masseSending ? 'Sender…' : '📤 Send månedsfakturaer'}
          </button>
          <button onClick={sendPurringer} style={{ padding:'12px', borderRadius:10, border:'1px solid ' + T.orange + '55', background: T.orange + '15', color:T.orange, cursor:'pointer', fontWeight:800, fontSize:13 }}>
            📬 Send purringer
          </button>
        </div>
        {masseRes !== null && (
          <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8, background: T.green + '15', color:T.green, fontSize:12, fontWeight:800 }}>
            ✅ Sendte {masseRes} fakturaer
          </div>
        )}
        <div style={{ marginTop:8, fontSize:11, color:T.muted }}>
          Junior: <strong style={{ color:T.blue }}>{JUNIOR_AVGIFT} kr</strong> · Senior: <strong style={{ color:T.gold }}>{SENIOR_AVGIFT} kr</strong> · Fritidskort: <strong style={{ color:T.purple }}>0 kr (første {FRITIDSKORT_MONTHS} mnd)</strong>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))', gap:6, marginBottom:10 }}>
        {[...BETALING_STATUSER, {key:'betalt',label:'Betalt',color:T.green,icon:'💰'}].map(s => {
          const count = fakturaer.filter(f => f.betalingStatus === s.key).length
          return (
            <div key={s.key} onClick={() => setFilterSt(filterSt === s.key ? 'alle' : s.key)} style={{ background:T.card, border:'1px solid ' + (count > 0 && s.key !== 'betalt' && s.key !== 'ikke_forfalt' ? s.color : T.border) + '44', borderRadius:10, padding:'10px 8px', textAlign:'center', cursor:'pointer', opacity: filterSt === s.key ? 1 : 0.7 }}>
              <div style={{ fontSize:9 }}>{s.icon}</div>
              <div style={{ fontWeight:900, fontSize:18, color:s.color }}>{count}</div>
              <div style={{ fontSize:9, color:T.muted, fontWeight:700, textTransform:'uppercase' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        <input placeholder="🔍 Søk…" value={searchQ} onChange={e => setSQ(e.target.value)} style={{ flex:1, minWidth:120, padding:'7px 10px', borderRadius:9, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none' }}/>
        {['alle', ...BETALING_STATUSER.map(s => s.key), 'betalt'].map(s => (
          <button key={s} onClick={() => setFilterSt(s)} style={{ padding:'6px 10px', borderRadius:9, border:'1px solid ' + (filterSt === s ? T.accent : T.border), background: filterSt === s ? T.accent : 'transparent', color: filterSt === s ? '#fff' : T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
            {s === 'alle' ? 'Alle' : bsLabel[s] || s}
          </button>
        ))}
      </div>

      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden' }}>
        {visF.length === 0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen fakturaer</div>}
        {visF.map((f, i) => {
          const bc = bsColor[f.betalingStatus] || T.muted
          const bl = bsLabel[f.betalingStatus] || f.betalingStatus
          return (
            <div key={f.id} style={{ padding:'12px 14px', borderBottom: i < visF.length-1 ? '1px solid ' + T.border : 'none', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:100 }}>
                <div style={{ fontWeight:800, fontSize:13 }}>
                  {f.mottaker}
                  {f.isJunior && ' 🧒'}
                  {f.autoSent && ' 🤖'}
                </div>
                <div style={{ fontSize:11, color:T.muted }}>{f.id} · {f.dato} · Forfall {f.forfall}</div>
              </div>
              <span style={{ fontWeight:900, fontSize:14, color:T.green }}>{f.total.toLocaleString('nb-NO')} kr</span>
              <Tag c={bc}>{bl}</Tag>
              <div style={{ display:'flex', gap:5 }}>
                {f.betalingStatus !== 'betalt' && (
                  <button onClick={() => saveFakt(fakturaer.map(x => x.id === f.id ? { ...x, betalingStatus:'betalt' } : x))} style={{ padding:'4px 8px', borderRadius:7, border:'1px solid ' + T.green + '44', background: T.green + '15', color:T.green, cursor:'pointer', fontSize:11, fontWeight:800 }}>Betalt</button>
                )}
                {f.betalingStatus === 'forfalt' && (
                  <button onClick={() => saveFakt(fakturaer.map(x => x.id === f.id ? { ...x, betalingStatus:'purret' } : x))} style={{ padding:'4px 8px', borderRadius:7, border:'1px solid ' + T.orange + '44', background: T.orange + '15', color:T.orange, cursor:'pointer', fontSize:11, fontWeight:800 }}>Purr</button>
                )}
                <button onClick={() => saveFakt(fakturaer.filter(x => x.id !== f.id))} style={{ padding:'4px 8px', borderRadius:7, border:'1px solid ' + T.border, background:'transparent', color:T.red, cursor:'pointer', fontSize:11 }}>🗑</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// SMS TAB
// ═══════════════════════════════════════════════════════════
function SmsTab({ members, attendance }) {
  const [period, setPeriod]    = useState(30)
  const [threshold, setThresh] = useState(80)
  const [msgType, setMsgType]  = useState('motivasjon')
  const [msgTpl, setMsgTpl]    = useState('Hei {navn}! 🔥 Du har trent {prosent}% de siste {periode} dagene – imponerende innsats! Hold det gående 💪 – Spartacus')
  const [sent, setSent]        = useState([])
  const [sending, setSending]  = useState(false)
  const [log, setLog]          = useState([])

  const TEMPLATES = {
    motivasjon: 'Hei {navn}! 🔥 Du har trent {prosent}% de siste {periode} dagene – imponerende innsats! Hold det gående 💪 – Spartacus',
    faktura:    'Hei {navn}! Husk treningsavgiften for denne måneden. Ta kontakt ved spørsmål 📞 – Spartacus',
    purring:    'Hei {navn}! Vi mangler betaling. Vennligst betal snarest for å unngå inkasso 📬 – Spartacus',
    arrangement:'Hei {navn}! 🥊 Husk arrangement denne helgen – møt opp og vis hva du er laget av! – Spartacus',
    kursstart:  'Hei {navn}! Nytt kurs starter snart – er du klar? Meld deg på nå 🚀 – Spartacus',
  }

  const cutoff   = daysAgo(period)
  const eligible = useMemo(() => {
    return members.filter(m => !m.isCoach).map(m => {
      const logs = attendance.filter(a => a.memberId === m.id && a.date >= cutoff)
      const att  = logs.filter(a => a.status !== 'absent').length
      const pct  = logs.length > 0 ? Math.round((att/logs.length)*100) : 0
      return { ...m, pct, sessions: logs.length }
    }).filter(m => m.pct >= threshold).sort((a, b) => b.pct - a.pct)
  }, [members, attendance, period, threshold])

  const alreadySent = useMemo(() => new Set(sent.map(s => s.id)), [sent])
  const buildMsg    = m => msgTpl.replace('{navn}', m.name.split(' ')[0]).replace('{prosent}', m.pct).replace('{periode}', period)

  async function sendAll() {
    setSending(true)
    for (const m of eligible.filter(m => !alreadySent.has(m.id))) {
      await new Promise(r => setTimeout(r, 200))
      const e = { id: m.id, name: m.name, phone: m.phone || 'Ukjent', pct: m.pct, msg: buildMsg(m), sentAt: new Date().toLocaleString('nb-NO') }
      setSent(p => [...p, e])
      setLog(p => [e, ...p])
    }
    setSending(false)
  }

  const unsent = eligible.filter(m => !alreadySent.has(m.id))

  return (
    <div>
      <div style={{ fontWeight:900, fontSize:16, marginBottom:12 }}>📱 SMS-utsendelse</div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>📝 Velg mal</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
          {[{k:'motivasjon',l:'💪 Motivasjon'},{k:'faktura',l:'💳 Faktura'},{k:'purring',l:'📬 Purring'},{k:'arrangement',l:'🥊 Arrangement'},{k:'kursstart',l:'🚀 Kursstart'}].map(t => (
            <button key={t.k} onClick={() => { setMsgType(t.k); setMsgTpl(TEMPLATES[t.k]) }} style={{ padding:'6px 12px', borderRadius:99, border:'1px solid ' + (msgType === t.k ? T.accent : T.border), background: msgType === t.k ? T.accent : 'transparent', color: msgType === t.k ? '#fff' : T.muted, cursor:'pointer', fontSize:12, fontWeight:700 }}>
              {t.l}
            </button>
          ))}
        </div>
        <textarea value={msgTpl} onChange={e => setMsgTpl(e.target.value)} rows={3} style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
        <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{msgTpl.length}/160 tegn</div>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <select value={period} onChange={e => setPeriod(+e.target.value)} style={selSt}><option value={7}>7d</option><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option></select>
        <select value={threshold} onChange={e => setThresh(+e.target.value)} style={selSt}><option value={0}>Alle</option><option value={50}>≥50%</option><option value={70}>≥70%</option><option value={80}>≥80%</option></select>
        <div style={{ flex:1, display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:12, color:T.muted }}>{eligible.length} utøvere</span>
          {unsent.length > 0 && (
            <button onClick={sendAll} disabled={sending} style={{ flex:1, padding:'8px 14px', borderRadius:9, border:'none', background: sending ? T.dim : T.accent, color:'#fff', fontWeight:800, cursor: sending ? 'not-allowed' : 'pointer', fontSize:13 }}>
              {sending ? 'Sender…' : '📤 Send alle (' + unsent.length + ')'}
            </button>
          )}
        </div>
      </div>
      <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden', marginBottom:12 }}>
        {eligible.length === 0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen oppfyller filteret</div>}
        {eligible.map(m => {
          const isSent = alreadySent.has(m.id)
          return (
            <div key={m.id} style={{ padding:'10px 14px', borderBottom:'1px solid ' + T.border, display:'flex', alignItems:'center', gap:10 }}>
              <Avatar name={m.name} size={28}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{m.name}</div>
                <div style={{ fontSize:11, color:T.muted }}>{m.phone || 'Ingen tlf'} · {m.pct}%</div>
              </div>
              {isSent ? (
                <Tag c={T.green}>✓</Tag>
              ) : (
                <button onClick={() => { const e = { id:m.id, name:m.name, phone:m.phone||'Ukjent', pct:m.pct, msg:buildMsg(m), sentAt:new Date().toLocaleString('nb-NO') }; setSent(p=>[...p,e]); setLog(p=>[e,...p]) }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid ' + T.accent + '44', background: T.accent + '15', color:T.accentL, cursor:'pointer', fontSize:11, fontWeight:800 }}>
                  Send
                </button>
              )}
            </div>
          )
        })}
      </div>
      {log.length > 0 && (
        <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid ' + T.border, fontWeight:800, fontSize:13, display:'flex', justifyContent:'space-between' }}>
            <span>📋 Logg</span>
            <Tag c={T.green}>{log.length}</Tag>
          </div>
          {log.slice(0, 10).map((s, i) => (
            <div key={s.id + '' + i} style={{ padding:'8px 14px', borderBottom: i < Math.min(log.length,10)-1 ? '1px solid ' + T.border : 'none', display:'flex', gap:8 }}>
              <Avatar name={s.name} size={24}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:12 }}>{s.name}</div>
                <div style={{ fontSize:10, color:T.muted, fontStyle:'italic' }}>"{s.msg.slice(0,60)}…"</div>
              </div>
              <div style={{ fontSize:10, color:T.muted }}>{s.sentAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MANAGE TAB
// ═══════════════════════════════════════════════════════════
function ManageTab({ members, setMembers, syncMI, miSt }) {
  const [subTab, setSub]      = useState('members')
  const [importTxt, setIT]    = useState('')
  const [importMsg, setIM]    = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [newM, setNewM]       = useState({ firstName:'', lastName:'', phone:'', email:'', disc:'MMA', birthDate:'', gender:'', address:'', isCoach:false })
  const [arbeidsKopi, setAK]  = useState(() => [...members])
  const [editingM, setEM]     = useState(null)
  const fileRef = useRef()

  useEffect(() => setAK([...members]), [members])
  const harUlagrede = JSON.stringify(arbeidsKopi) !== JSON.stringify(members)

  function lagre() {
    lsSet(LS_MEMBERS, arbeidsKopi)
    setMembers([...arbeidsKopi])
    setSavedMsg('✅ Lagret ' + arbeidsKopi.length + ' – ' + new Date().toLocaleTimeString('nb-NO'))
    setTimeout(() => setSavedMsg(''), 4000)
  }

  function handleImport() {
    const lines    = importTxt.trim().split('\n').filter(Boolean)
    const isH      = lines[0] && (lines[0].toLowerCase().includes('fornavn') || lines[0].toLowerCase().includes('navn'))
    const data     = isH ? lines.slice(1) : lines
    const toAdd    = []
    data.forEach(line => {
      const p         = line.split(/[,;\t]+/)
      const firstName = (p[0]||'').trim().replace(/^"|"$/g,'')
      const lastName  = (p[1]||'').trim().replace(/^"|"$/g,'')
      const disc      = (p[2]||'MMA').trim().replace(/^"|"$/g,'') || 'MMA'
      const role      = (p[3]||'').trim().toLowerCase()
      const email     = (p[4]||'').trim()
      const phone     = (p[5]||'').trim()
      const address   = (p[6]||'').trim()
      const birthDate = (p[9]||'').trim()
      const gender    = (p[10]||'').trim()
      const full      = lastName ? firstName + ' ' + lastName : firstName
      if (!full.trim()) return
      toAdd.push({ firstName, lastName, name: full.trim(), disc, isCoach: role.includes('trener') || role.includes('coach'), email, phone, address, birthDate, gender })
    })
    if (toAdd.length === 0) { setIM('⚠️ Tom eller feil format'); return }
    const existing = new Set(arbeidsKopi.map(m => m.name.toLowerCase()))
    const added    = toAdd.filter(m => !existing.has(m.name.toLowerCase())).map(m => ({
      id: 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      ...m, miActive:false, miExpires:null, miUnpaid:false, notMember:true,
      postalCode:'', city:'', firstName: m.firstName, lastName: m.lastName,
    }))
    if (added.length === 0) { setIM('⚠️ Alle finnes allerede'); return }
    setAK(p => [...p, ...added])
    setIM('✅ ' + added.length + ' importert – husk å lagre')
    setIT('')
  }

  function addMember() {
    const full = [newM.firstName.trim(), newM.lastName.trim()].filter(Boolean).join(' ')
    if (!full) return
    setAK(p => [...p, { id:'man_' + Date.now(), name:full, ...newM, miActive:false, miExpires:null, miUnpaid:false, notMember:true, postalCode:'', city:'' }])
    setNewM({ firstName:'', lastName:'', phone:'', email:'', disc:'MMA', birthDate:'', gender:'', address:'', isCoach:false })
  }

  function slettMedlem(id) {
    const del = lsGet(LS_DELETED, [])
    if (!del.includes(id)) lsSet(LS_DELETED, [...del, id])
    setAK(p => p.filter(m => m.id !== id))
  }

  return (
    <div>
      <div style={{ position:'sticky', top:58, zIndex:100, marginBottom:10 }}>
        <div style={{ background: harUlagrede ? T.yellow + '18' : T.green + '10', border:'1px solid ' + (harUlagrede ? T.yellow : T.green) + '44', borderRadius:11, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:12, color: harUlagrede ? T.yellow : T.green }}>
              {harUlagrede ? '⚠️ Ulagrede endringer' : '✅ Alt lagret'}
            </div>
            <div style={{ fontSize:10, color:T.muted }}>{savedMsg || arbeidsKopi.length + ' medlemmer'}</div>
          </div>
          <button onClick={lagre} disabled={!harUlagrede} style={{ padding:'8px 18px', borderRadius:9, border:'none', background: harUlagrede ? T.green : T.dim, color:'#fff', fontWeight:900, fontSize:13, cursor: harUlagrede ? 'pointer' : 'not-allowed', opacity: harUlagrede ? 1 : 0.5 }}>
            💾 Lagre endringer
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:5, marginBottom:12, flexWrap:'wrap' }}>
        {[{key:'members',label:'👥 Legg til'},{key:'import',label:'📥 Import'},{key:'mi',label:'⚙️ Min Idrett'}].map(t => (
          <button key={t.key} onClick={() => setSub(t.key)} style={{ padding:'7px 11px', borderRadius:9, border:'1px solid ' + (subTab === t.key ? T.accent : T.border), background: subTab === t.key ? T.accent : 'transparent', color: subTab === t.key ? '#fff' : T.muted, cursor:'pointer', fontSize:11, fontWeight:700 }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'members' && (
        <>
          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:14, marginBottom:12 }}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>+ Nytt medlem</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {[['Fornavn *','firstName'],['Etternavn','lastName'],['Telefon','phone'],['E-post','email'],['Adresse','address']].map(([l, k]) => (
                <div key={k}>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{l}</div>
                  <input value={newM[k]||''} onChange={e => setNewM(p => ({ ...p, [k]: e.target.value }))} style={{ ...inputSt, marginBottom:0 }}/>
                </div>
              ))}
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>Fødselsdato</div>
                <input type="date" value={newM.birthDate||''} onChange={e => setNewM(p => ({ ...p, birthDate: e.target.value }))} style={{ ...inputSt, marginBottom:0 }}/>
              </div>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>Kjønn</div>
                <select value={newM.gender||''} onChange={e => setNewM(p => ({ ...p, gender: e.target.value }))} style={{ ...selSt, fontSize:13, padding:'11px 14px', width:'100%' }}>
                  <option value="">Velg</option><option>Mann</option><option>Kvinne</option><option>Annet</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>Disiplin</div>
                <select value={newM.disc||'MMA'} onChange={e => setNewM(p => ({ ...p, disc: e.target.value }))} style={{ ...selSt, fontSize:13, padding:'11px 14px', width:'100%' }}>
                  {DISCIPLINES.slice(1).map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, paddingTop:20 }}>
                <input type="checkbox" checked={newM.isCoach||false} onChange={e => setNewM(p => ({ ...p, isCoach: e.target.checked }))} style={{ accentColor:T.gold }}/>
                <span style={{ color:T.muted, fontSize:13 }}>Trener</span>
              </div>
            </div>
            <BigBtn onClick={addMember} disabled={!newM.firstName.trim()} style={{ marginTop:10 }}>+ Legg til</BigBtn>
          </div>

          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, overflow:'hidden' }}>
            {arbeidsKopi.length === 0 && <div style={{ padding:24, color:T.muted, textAlign:'center' }}>Ingen</div>}
            {arbeidsKopi.map((m, i) => (
              <div key={m.id} style={{ padding:'10px 13px', borderBottom: i < arbeidsKopi.length-1 ? '1px solid ' + T.border : 'none', display:'flex', alignItems:'center', gap:8 }}>
                <Avatar name={m.name} size={28}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>
                    {m.name}
                    {isJunior(m) && <span style={{ marginLeft:6 }}><Tag c={T.blue}>Junior</Tag></span>}
                  </div>
                  <div style={{ fontSize:11, color:T.muted }}>{m.email || '–'} · {m.phone || '–'}</div>
                </div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={() => setEM({ ...m })} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid ' + T.accent + '44', background: T.accent + '15', color:T.accent, cursor:'pointer', fontSize:11 }}>✏️</button>
                  <button onClick={() => slettMedlem(m.id)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid ' + T.red + '44', background: T.red + '12', color:T.red, cursor:'pointer', fontSize:11 }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {subTab === 'import' && (
        <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:16 }}>
          <div style={{ fontWeight:800, fontSize:13, marginBottom:4 }}>📥 Importer CSV</div>
          <div style={{ color:T.muted, fontSize:11, marginBottom:10 }}>
            Format: <code style={{ background:T.surface, padding:'1px 5px', borderRadius:4 }}>Fornavn,Etternavn,Gren,Rolle,E-post,Telefon,Adresse,Postnr,Sted,Fødselsdato,Kjønn</code>
          </div>
          <button onClick={() => fileRef.current.click()} style={{ marginBottom:8, padding:'8px 12px', borderRadius:9, border:'1px dashed ' + T.border, background:T.surface, color:T.muted, cursor:'pointer', fontSize:12, width:'100%' }}>
            📎 Last opp CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={e => {
            const f = e.target.files[0]
            if (!f) return
            const r = new FileReader()
            r.onload = ev => { setIT(ev.target.result); setIM('') }
            r.readAsText(f, 'UTF-8')
            e.target.value = ''
          }}/>
          <textarea value={importTxt} onChange={e => { setIT(e.target.value); setIM('') }} placeholder="Torpal,Merjoev,MMA,Utøver,torpal@ex.com,+4791234567" style={{ width:'100%', height:100, padding:'10px 12px', borderRadius:10, border:'1px solid ' + T.border, background:T.surface, color:T.text, fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'monospace' }}/>
          <button onClick={handleImport} disabled={!importTxt.trim()} style={{ marginTop:8, width:'100%', padding:'12px', borderRadius:10, border:'none', background: importTxt.trim() ? T.accent : T.dim, color:'#fff', fontWeight:900, fontSize:14, cursor: importTxt.trim() ? 'pointer' : 'not-allowed', opacity: importTxt.trim() ? 1 : 0.5 }}>
            Importer
          </button>
          {importMsg && (
            <div style={{ marginTop:8, padding:'8px 12px', borderRadius:9, background: importMsg.startsWith('✅') ? T.green + '15' : T.yellow + '15', border:'1px solid ' + (importMsg.startsWith('✅') ? T.green : T.yellow) + '55', color: importMsg.startsWith('✅') ? T.green : T.yellow, fontWeight:700, fontSize:12 }}>
              {importMsg}
            </div>
          )}
        </div>
      )}

      {subTab === 'mi' && (
        <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:14, padding:16 }}>
          <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>Min Idrett integrasjon</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', padding:12, borderRadius:10, background:T.surface, border:'1px solid ' + (miSt.status === 'ok' ? T.green : T.border), marginBottom:12 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: miSt.status === 'ok' ? T.green : miSt.status === 'syncing' ? T.yellow : T.muted, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:13 }}>{miSt.status === 'ok' ? 'Tilkoblet' : miSt.status === 'syncing' ? 'Synkroniserer…' : 'Ikke tilkoblet'}</div>
              {miSt.count > 0 && <div style={{ fontSize:11, color:T.muted }}>{miSt.count} fra Min Idrett</div>}
            </div>
            <button onClick={syncMI} style={{ padding:'7px 12px', borderRadius:8, border:'1px solid ' + T.accent, background:'transparent', color:T.accent, fontWeight:800, cursor:'pointer', fontSize:12 }}>
              ↻ Synk
            </button>
          </div>
          <div style={{ padding:12, borderRadius:10, background: T.blue + '12', border:'1px solid ' + T.blue + '33', fontSize:12, color:T.blue, lineHeight:1.7 }}>
            <strong>Koble til ekte Min Idrett:</strong><br/>
            1. Registrer på idrettsforbundet.no<br/>
            2. Få API-tilgang fra NIF<br/>
            3. Bytt ut <code style={{ background:T.surface, padding:'1px 4px', borderRadius:3 }}>mockMIFetch()</code>
          </div>
        </div>
      )}

      {editingM && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={e => e.target === e.currentTarget && setEM(null)}>
          <div style={{ background:T.card, border:'1px solid ' + T.border, borderRadius:20, padding:22, maxWidth:480, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontWeight:900, fontSize:16 }}>✏️ {editingM.name}</div>
              <button onClick={() => setEM(null)} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {[['Fornavn','firstName'],['Etternavn','lastName'],['E-post','email'],['Telefon','phone'],['Adresse','address']].map(([l, k]) => (
                <div key={k}>
                  <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{l}</div>
                  <input value={editingM[k]||''} onChange={e => setEM(p => ({ ...p, [k]: e.target.value }))} style={{ ...inputSt, marginBottom:0 }}/>
                </div>
              ))}
              <div>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>Fødselsdato</div>
                <input type="date" value={editingM.birthDate||''} onChange={e => setEM(p => ({ ...p, birthDate: e.target.value }))} style={{ ...inputSt, marginBottom:0 }}/>
              </div>
            </div>
            <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={editingM.isCoach||false} onChange={e => setEM(p => ({ ...p, isCoach: e.target.checked }))} style={{ accentColor:T.gold }}/>
              <span style={{ color:T.muted, fontSize:13 }}>Trener</span>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={() => {
                const full = [editingM.firstName, editingM.lastName].filter(Boolean).join(' ') || editingM.name
                setAK(p => p.map(m => m.id === editingM.id ? { ...editingM, name: full } : m))
                setEM(null)
              }} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:T.green, color:'#fff', fontWeight:900, cursor:'pointer' }}>
                💾 Lagre
              </button>
              <button onClick={() => setEM(null)} style={{ padding:'12px 16px', borderRadius:10, border:'1px solid ' + T.border, background:'transparent', color:T.muted, cursor:'pointer' }}>
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
