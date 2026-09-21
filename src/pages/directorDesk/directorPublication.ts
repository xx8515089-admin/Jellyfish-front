import { getStoredAuthUser } from '../../auth'
import { StudioDirectorDesks as api, type DirectorId } from '../../services/studioDirectorDesks'
import { withCanvasOperationLock } from '../canvas/TapnowStudio/canvasOperationLock'

interface PublicationRequest { id: DirectorId; expectedDraftRevisionNo: number; expectedRevisionNo: number; clientRequestId: string }
const owner = () => { const user = getStoredAuthUser(); return String(user?.id ?? user?.username ?? 'anonymous') }
const keyFor = (id: DirectorId, account = owner()) => `director-publication:${account}:${id}`
export const hasPendingDirectorPublication = (id: DirectorId) => window.localStorage.getItem(keyFor(id)) != null
const assertOwner = (account: string) => { if (owner() !== account) throw new Error('登录账户已变化，请使用原账户找回发布；原请求已保留') }
const read = (key: string): PublicationRequest | null => JSON.parse(window.localStorage.getItem(key) || 'null')
const archive = (key: string, body: PublicationRequest) => {
  window.localStorage.setItem(key + ':history:' + body.clientRequestId, JSON.stringify(body))
  window.localStorage.removeItem(key)
}
export async function publishDirectorDraft(id: DirectorId, expectedDraftRevisionNo: number, expectedRevisionNo: number) {
  const account = owner(), key = keyFor(id, account)
  return withCanvasOperationLock(key, async () => {
    assertOwner(account)
    if (read(key)) throw new Error('存在结果待确认的发布，请先查询或原样重试，不要重新保存发布')
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const clientRequestId = 'publish-' + [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
    const body = { id, expectedDraftRevisionNo, expectedRevisionNo, clientRequestId }
    window.localStorage.setItem(key, JSON.stringify(body))
    try {
      const result = await api.publishDraft(id, expectedDraftRevisionNo, expectedRevisionNo, clientRequestId)
      assertOwner(account); archive(key, body)
      return result
    } catch (error) {
      // Only a definitive first-attempt validation response allows correcting a new publication.
      const code = (error as { errorCode?: string }).errorCode
      if (['DIRECTOR_DRAFT_REVISION_CONFLICT', 'DIRECTOR_BASE_REVISION_CONFLICT', 'DIRECTOR_REVISION_CONFLICT', 'DIRECTOR_REQUEST_INVALID', 'DIRECTOR_SNAPSHOT_INVALID', 'DIRECTOR_SNAPSHOT_TOO_LARGE', 'DIRECTOR_VALIDATION_FAILED'].includes(code || '')) {
        assertOwner(account); archive(key, body)
      }
      throw error
    }
  })
}
/** Query never publishes. Explicit retry always retains all original parameters, even after NOT_FOUND. */
export async function recoverDirectorPublication(id: DirectorId, retry = false) {
  const account = owner(), key = keyFor(id, account)
  return withCanvasOperationLock(key, async () => {
    assertOwner(account)
    const body = read(key)
    if (!body || String(body.id) !== String(id)) throw new Error('没有可恢复的原发布请求')
    const result = retry
      ? await api.publishDraft(body.id, body.expectedDraftRevisionNo, body.expectedRevisionNo, body.clientRequestId)
      : await api.publication(body.id, body.clientRequestId)
    assertOwner(account); archive(key, body)
    return result
  })
}
