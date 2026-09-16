import type { CartridgeIdentity } from './cartridge-id.ts'

/**
 * The cartridge kept in the browser between visits, so a dump need not be
 * chosen again each time: its bytes as they were dropped, whole, and what
 * they were identified as. **Nothing is converted**: the game reads the
 * cartridge itself, here as on a first visit — this is the same file, kept
 * where the browser keeps large things (IndexedDB; the bytes never leave the
 * machine). One cartridge is kept; a new one replaces it. Ours, all of it.
 */
const DB = 'minstrel'
const STORE = 'cartridge'
const KEY = 'current'

export interface KeptCartridge {
  readonly bytes: Uint8Array
  readonly identity: CartridgeIdentity
  /** When it was kept: an ISO date. */
  readonly keptAt: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB, 1)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('the browser would not open its storage'))
    request.onblocked = () => reject(new Error('the browser’s storage is in use by another tab'))
  })
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('the browser’s storage failed'))
  })
}

/** Keep these bytes as the cartridge, replacing any kept before. */
export async function keepCartridge(bytes: Uint8Array, identity: CartridgeIdentity): Promise<void> {
  const db = await open()
  try {
    const kept: KeptCartridge = { bytes, identity, keptAt: new Date().toISOString() }
    await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).put(kept, KEY))
  } finally {
    db.close()
  }
}

/** The cartridge kept, if there is one and the browser gives it back. */
export async function keptCartridge(): Promise<KeptCartridge | undefined> {
  let db: IDBDatabase
  try {
    db = await open()
  } catch {
    return undefined
  }
  try {
    const found = await settle(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY))
    if (!found || typeof found !== 'object') return undefined
    const kept = found as Partial<KeptCartridge>
    if (!(kept.bytes instanceof Uint8Array) || !kept.identity || !kept.keptAt) return undefined
    return kept as KeptCartridge
  } catch {
    return undefined
  } finally {
    db.close()
  }
}

/** Forget the kept cartridge. */
export async function forgetCartridge(): Promise<void> {
  const db = await open()
  try {
    await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY))
  } finally {
    db.close()
  }
}
