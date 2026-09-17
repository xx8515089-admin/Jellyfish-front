import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Modal, Space, Spin, Tag } from 'antd'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { StudioAssetGenerationApi } from '../../../services/studioAssetGeneration'
import type { StudioAssetCopyrightReviewResult } from '../../../services/studioAssetGeneration'
import { parseCopyrightFindings } from './copyrightReviewFindings'

type Props = { assetId: number; versionId: number; onClose: () => void }

export default function AssetCopyrightReviewModal({ assetId, versionId, onClose }: Props) {
  const l = useBilingualText()
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<StudioAssetCopyrightReviewResult>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    let active = true
    setLoading(true)
    setResult(undefined)
    setError(undefined)
    const request = StudioAssetGenerationApi.requestCopyrightReview({ assetId, versionId })
    request.promise.then((value) => {
      if (!active) return
      if (value.versionId !== versionId) throw new Error('Copyright review returned a different image version')
      setResult(value)
    }).catch((cause: unknown) => {
      if (active) setError(cause)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
      request.cancel()
    }
  }, [assetId, versionId, attempt])

  const statusNames: Record<number, string> = {
    2: l('初筛低风险', 'Low risk in initial screening'),
    3: l('发现疑点', 'Potential issues found'),
    4: l('需人工复核', 'Manual review required'),
    5: l('失败', 'Failed'),
  }
  const riskNames: Record<number, string> = {
    0: l('未判断', 'Undetermined'), 1: l('低', 'Low'),
    2: l('中', 'Medium'), 3: l('高', 'High'),
  }
  const severityNames: Record<string, string> = {
    low: l('低', 'Low'), medium: l('中', 'Medium'), high: l('高', 'High'),
  }
  const findings = parseCopyrightFindings(result?.findings)
  const resultType = result?.reviewStatus === 5 ? 'error'
    : result?.reviewStatus === 2 && result.riskLevel === 1 ? 'success' : 'warning'

  return (
    <Modal
      open
      title={l('版权审查', 'Copyright review')}
      onCancel={onClose}
      width={720}
      zIndex={1400}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowWrap: 'anywhere' } }}
      footer={[
        <Button key="retry" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>
          {l('重新审查', 'Review again')}
        </Button>,
        <Button key="close" onClick={onClose}>{l('关闭', 'Close')}</Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <span>{l('图片版本 ID', 'Image version ID')}: {versionId}</span>
        {loading && <Space><Spin size="small" /><span>{l('正在审查图片，请稍候…', 'Reviewing image…')}</span></Space>}
        {error !== undefined && <Alert type="error" showIcon message={getApiErrorMessage(error, l('版权审查失败，请重试', 'Copyright review failed. Please retry.'))} />}
        {result && (
          <>
            <Alert type={resultType} showIcon message={result.resultMessage || result.reviewStatusName || statusNames[result.reviewStatus ?? -1] || l('审查结果未知', 'Unknown review result')} />
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={l('审查状态', 'Review status')}>
                {statusNames[result.reviewStatus ?? -1] || result.reviewStatusName || l('未知', 'Unknown')}
              </Descriptions.Item>
              <Descriptions.Item label={l('风险等级', 'Risk level')}>
                {riskNames[result.riskLevel ?? -1] || result.riskLevelName || l('未判断', 'Undetermined')}
              </Descriptions.Item>
              {result.riskScore !== null && <Descriptions.Item label={l('风险评分', 'Risk score')}>{result.riskScore}</Descriptions.Item>}
              {result.reviewedAt && <Descriptions.Item label={l('审查时间', 'Reviewed at')}>{result.reviewedAt.replace('T', ' ')}</Descriptions.Item>}
            </Descriptions>
            {findings.items.map((finding, index) => (
              <div key={index} style={{ border: '1px solid rgba(128,128,128,.25)', borderRadius: 8, padding: 14 }}>
                <Space wrap>
                  <strong>{finding.message || finding.code || l('审查发现', 'Finding')}</strong>
                  {finding.severity && <Tag>{severityNames[finding.severity] || finding.severity}</Tag>}
                </Space>
                {finding.evidence && <p>{l('风险依据', 'Evidence')}: {finding.evidence}</p>}
                {finding.location && <p>{l('画面位置', 'Location')}: {finding.location}</p>}
                {finding.suggestion && <p>{l('修改建议', 'Suggestion')}: {finding.suggestion}</p>}
              </div>
            ))}
            {findings.raw && <Alert type="info" message={l('审查详情', 'Review details')} description={<div style={{ whiteSpace: 'pre-wrap' }}>{findings.raw}</div>} />}
            {result.disclaimer && <Alert type="info" showIcon message={l('审查说明', 'Disclaimer')} description={result.disclaimer} />}
          </>
        )}
      </Space>
    </Modal>
  )
}