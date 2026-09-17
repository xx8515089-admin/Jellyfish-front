type CopyrightFinding = {
  code?: string
  message?: string
  evidence?: string
  location?: string
  severity?: string
  suggestion?: string
}

export function parseCopyrightFindings(value: string | null | undefined): { items: CopyrightFinding[]; raw?: string } {
  if (!value?.trim()) return { items: [] }
  try {
    let parsed: unknown = JSON.parse(value)
    // Some responses contain a JSON-encoded string around the findings array.
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!Array.isArray(parsed)) return { items: [], raw: value }
    const items: CopyrightFinding[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { items: [], raw: value }
      const finding: CopyrightFinding = {}
      for (const key of ['code', 'message', 'evidence', 'location', 'severity', 'suggestion'] as const) {
        if (typeof item[key] === 'string') finding[key] = item[key]
      }
      if (!Object.values(finding).some((field) => field?.trim())) return { items: [], raw: value }
      items.push(finding)
    }
    return { items }
  } catch {
    return { items: [], raw: value }
  }
}