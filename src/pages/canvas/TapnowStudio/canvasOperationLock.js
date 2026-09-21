const localLocks = new Set()

/** Web Locks or an IndexedDB lease: fail closed rather than race paid submissions across tabs. */
export async function withCanvasOperationLock(key, work) {
  if (localLocks.has(key)) throw new Error('此操作正在处理中，请等待原回执')
  localLocks.add(key)
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(key, { ifAvailable: true }, lock => {
        if (!lock) throw new Error('其他标签页正在处理此操作，请等待原回执')
        return work()
      })
    }
    if (typeof window === 'undefined') return await work()
    if (!window.indexedDB) throw new Error('浏览器无法锁定跨标签页请求，请启用浏览器存储后重试')
    const owner = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')
    const db = await new Promise((resolve, reject) => {
      const open = window.indexedDB.open('canvas-operation-locks', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('locks')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const transact = release => new Promise((resolve, reject) => {
      const tx = db.transaction('locks', 'readwrite'), store = tx.objectStore('locks')
      const get = store.get(key)
      let acquired = false
      get.onsuccess = () => {
        const previous = get.result
        if (release) { if (previous?.owner === owner) store.delete(key); return }
        if (previous && previous.owner !== owner && previous.until > Date.now()) return
        store.put({ owner, until: Date.now() + 120000 }, key); acquired = true
      }
      tx.oncomplete = () => resolve(acquired)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('请求锁定失败'))
    })
    let renewal
    try {
      if (!await transact(false)) throw new Error('其他标签页正在处理此操作，请等待原回执')
      renewal = setInterval(() => { void transact(false).catch(() => {}) }, 30000)
      return await work()
    } finally {
      clearInterval(renewal)
      await transact(true).finally(() => db.close())
    }
  } finally { localLocks.delete(key) }
}
