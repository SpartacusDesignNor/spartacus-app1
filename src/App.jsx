function handleImport() {
  const lines     = importTxt.trim().split('\n').filter(Boolean)
  const isHeader  = lines[0]?.toLowerCase().includes('navn') || lines[0]?.toLowerCase().includes('name')
  const dataLines = isHeader ? lines.slice(1) : lines

  const toAdd = []
  dataLines.forEach(line => {
    const parts = line.split(/[,;\t]+/)
    const name  = (parts[0]||'').trim().replace(/^"|"$/g, '')
    const disc  = (parts[1]||'MMA').trim().replace(/^"|"$/g, '') || 'MMA'
    const role  = (parts[2]||'').trim().toLowerCase()
    if (!name) return
    toAdd.push({ name, disc, isCoach: role.includes('trener') || role.includes('coach') })
  })

  if (toAdd.length === 0) {
    setIM('⚠️ Filen er tom eller har feil format')
    return
  }

  setMembers(prev => {
    const existing = new Set(prev.map(m => m.name.toLowerCase()))
    const added = toAdd
      .filter(m => !existing.has(m.name.toLowerCase()))
      .map(m => ({
        id:        `imp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name:      m.name,
        disc:      m.disc,
        isCoach:   m.isCoach,
        miActive:  false,
        miExpires: null,
        miUnpaid:  false,
        notMember: true,
      }))

    if (added.length === 0) {
      setIM('⚠️ Alle i filen finnes allerede i systemet')
      return prev
    }

    const updated = [...prev, ...added]
    localStorage.setItem(LS_MEMBERS, JSON.stringify(updated))
    setIM(`✅ ${added.length} av ${toAdd.length} importert — ${toAdd.length - added.length} duplikat${toAdd.length - added.length !== 1 ? 'er' : ''} hoppet over`)
    return updated
  })

  setIT('')
}
