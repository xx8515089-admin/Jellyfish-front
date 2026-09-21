import { AssetImportsService, type CreateImportBatch, type ImportBatch, type ImportItem, type ImportPreview, type ImportTemplate } from '../../../../services/assetImportGenerated'

/** Validate new envelopes, including 201/202, without routing failures to legacy APIs. */
export function importData<T>(response: { code: number; message: string; data: T }): T {
  if (response.code < 200 || response.code >= 300 || (response.data === null || response.data === undefined)) throw Object.assign(new Error(response.message || '导入接口返回无效结果'), { body: response, errorCode: (response as { errorCode?: string }).errorCode || (response.data as { errorCode?: string } | null)?.errorCode })
  return response.data
}

/** Preserve server error details so unimplemented new routes are visible to the user. */
export function importError(error: unknown): string {
  const api = error as { body?: { message?: string }; message?: string }
  return api?.body?.message || api?.message || '导入请求失败'
}

/** Coordinates one modal's new-protocol batch; generated methods own all HTTP and authentication. */
export class AssetImportSession {
  active = true
  batch: ImportBatch | null = null
  preview: ImportPreview | null = null
  submitted = false
  private limits: ImportTemplate['limits'] | null = null
  private uploadHashes = new Map<string, string>()
  private signature = ''
  private createKey = ''
  private uploaded = new Set<string>()
  private uploadKeys = new Map<string, string>()
  private pendingCommand: (() => Promise<ImportBatch>) | null = null

  /** Reuse a create command after a lost response; changed input gets a fresh draft. */
  async prepare(input: CreateImportBatch): Promise<ImportBatch> {
    if (!this.active) throw new Error('导入窗口已关闭')
    if (!this.limits) this.limits = importData(await AssetImportsService.getImportTemplate({})).limits
    if (!this.limits) throw new Error('模板接口缺少导入限额，请确认后端版本')
    if (input.source === 'manifest' && new Blob([input.content]).size > this.limits.maxTextBytes) throw new Error('清单大小超过服务端限额')
    if (input.source === 'images' && (input.items.length > this.limits.maxFiles || input.items.some(item => item.size > this.limits!.maxFileBytes) || input.items.reduce((sum, item) => sum + item.size, 0) > this.limits.maxBatchBytes)) throw new Error('图片数量或文件大小超过服务端限额')
    if (this.pendingCommand) throw new Error('请先查询上次提交结果，再准备新批次')
    const signature = JSON.stringify(input)
    if (signature !== this.signature) {
      this.signature = signature
      this.createKey = crypto.randomUUID()
      this.batch = null
      this.preview = null
      this.submitted = false
      this.pendingCommand = null
      this.uploaded.clear()
      this.uploadKeys.clear()
      this.uploadHashes.clear()
    }
    if (!this.batch) this.batch = importData(await AssetImportsService.createImportBatch({ idempotencyKey: this.createKey, requestBody: input }))
    return this.batch
  }

  /** Upload each local file once; replaying an uncertain upload keeps its idempotency key. */
  async upload(clientItemId: string, file: File): Promise<void> {
    if (!this.active) throw new Error('导入窗口已关闭')
    if (!this.batch) return
    if (this.limits && file.size > this.limits.maxFileBytes) throw new Error('图片大小超过服务端限额')
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('')
    if (this.uploadHashes.has(clientItemId) && this.uploadHashes.get(clientItemId) !== hash) throw new Error('同一条目的文件内容已变化，请重建草稿')
    this.uploadHashes.set(clientItemId, hash)
    if (this.uploaded.has(clientItemId)) return
    const key = this.uploadKeys.get(clientItemId) ?? crypto.randomUUID()
    this.uploadKeys.set(clientItemId, key)
    const result = importData(await AssetImportsService.uploadImportFile({ idempotencyKey: key, formData: { batchId: this.batch.batchId, clientItemId, file } }))
    this.batch.revision = result.revision
    this.preview = null
    this.uploaded.add(clientItemId)
  }

  /** Read every result page; reject repeated or incomplete pages instead of losing row errors. */
  async rows(): Promise<ImportItem[]> {
    if (!this.batch) return []
    const result: ImportItem[] = [], seen = new Set<string>()
    for (let page = 1; ; page++) {
      if (!this.active) throw new Error('导入窗口已关闭')
      const data = importData(await AssetImportsService.listImportItems({ batchId: this.batch.batchId, page, pageSize: 100 }))
      for (const row of data.items) {
        if (seen.has(row.itemId)) throw new Error('导入结果分页重复，请重新查询')
        seen.add(row.itemId); result.push(row)
      }
      if (result.length >= data.total) return result
      if (!data.items.length) throw new Error('导入结果不完整，请重新查询')
    }
  }

  /** Bind preview eligibility to the current draft revision and load all validation rows. */
  async validate(): Promise<{ preview: ImportPreview; rows: ImportItem[] }> {
    if (!this.batch) throw new Error('请先准备导入内容')
    this.preview = null
    const preview = importData(await AssetImportsService.previewImportBatch({ requestBody: { batchId: this.batch.batchId, revision: this.batch.revision } }))
    this.batch.revision = preview.revision
    const rows = await this.rows()
    this.preview = preview
    return { preview, rows }
  }

  /** Submit valid rows once; an uncertain response is retried only with the original command key. */
  async commit(onProgress?: (rows: ImportItem[]) => void): Promise<ImportItem[]> {
    if (!this.active) throw new Error('导入窗口已关闭')
    if (!this.batch || !this.preview?.previewToken || this.preview.createCount + this.preview.updateCount === 0) throw new Error('请先预览有效资产')
    if (!this.submitted) {
      const batchId = this.batch.batchId, idempotencyKey = crypto.randomUUID()
      const requestBody = { batchId, revision: this.preview.revision, previewToken: this.preview.previewToken }
      this.pendingCommand = async () => importData(await AssetImportsService.commitImportBatch({ idempotencyKey, requestBody }))
      this.submitted = true
    }
    return this.resume(onProgress)
  }

  /** Retry only server-approved failed items, preserving their batch and uploaded resources. */
  async retry(itemIds: string[], onProgress?: (rows: ImportItem[]) => void): Promise<ImportItem[]> {
    if (!this.active) throw new Error('导入窗口已关闭')
    if (!this.batch || !itemIds.length) throw new Error('没有可重试项')
    if (this.pendingCommand) throw new Error('请先查询原重试命令的结果')
    const available = await this.rows()
    if (itemIds.some(id => !available.some(row => row.itemId === id && row.status === 'failed' && row.retryable === true))) throw new Error('仅能重试服务端标记可重试的失败项')
    const batchId = this.batch.batchId, idempotencyKey = crypto.randomUUID()
    this.pendingCommand = async () => importData(await AssetImportsService.retryImportBatch({ idempotencyKey, requestBody: { batchId, itemIds } }))
    this.submitted = true
    return this.resume(onProgress)
  }

  /** Stop polling on unmount or after ten minutes; retain the batch for explicit status recovery. */
  async resume(onProgress?: (rows: ImportItem[]) => void): Promise<ImportItem[]> {
    if (!this.batch) throw new Error('没有可查询的导入批次')
    if (!this.active) throw new Error('导入窗口已关闭')
    if (this.pendingCommand) {
      try {
        this.batch = await this.pendingCommand()
        this.pendingCommand = null
      } catch (error) {
        const status = (error as { status?: number }).status
        // Explicit rejections did not start a task. Transport failures retain the exact command.
        if (status && status >= 400 && status < 500 && ![401,403,408,429].includes(status)) {
          this.submitted = false; this.pendingCommand = null; this.preview = null
        }
        throw error
      }
    }
    for (let attempt = 0; attempt < 300; attempt++) {
      if (!this.active) throw new Error('导入窗口已关闭')
      let rows: ImportItem[]
      try {
        this.batch = importData(await AssetImportsService.getImportBatch({ batchId: this.batch.batchId }))
        rows = await this.rows()
      } catch (error) {
        if ((error as { status?: number }).status !== 429) throw error
        await new Promise(resolve => setTimeout(resolve, Math.max(3000, (error as { retryAfterMs?: number }).retryAfterMs || 0)))
        continue
      }
      if (!this.active) throw new Error('导入窗口已关闭')
      onProgress?.(rows)
      if (['succeeded','partial_success','failed'].includes(this.batch.status)) {
        this.submitted = false
        return rows
      }
      if (!['queued','running'].includes(this.batch.status)) throw new Error('批次尚未执行或已经过期，请重新预览')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('导入仍在后台处理，请点击查询结果继续查看')
  }
}
