import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Image, Input, Modal, Pagination, Row, Select, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { StudioAssetLibraryApi, formatAssetLibraryTags, type StudioAssetLibraryAssetType, type StudioAssetLibraryItem } from '../../../../services/studioAssetLibrary'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import { DisplayImageCard } from '../components/DisplayImageCard'
import { buildFileContentUrl, resolveAssetUrl } from '../utils'
import './AssetLibraryTab.css'

const coverUrl = (item: StudioAssetLibraryItem) => resolveAssetUrl(item.coverUrl) || buildFileContentUrl(item.coverFileId)

export function AssetLibraryTab({ assetType, refreshToken = 0 }: {
  assetType: StudioAssetLibraryAssetType
  refreshToken?: number
}) {
  const l = useBilingualText()
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<1 | 2>(1)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [revision, setRevision] = useState(0)
  const [items, setItems] = useState<StudioAssetLibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [detail, setDetail] = useState<StudioAssetLibraryItem | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(undefined)
    setItems([])
    setTotal(0)
    setDetail(null)
    void StudioAssetLibraryApi.listItems({ assetType, keyword, status, page, pageSize })
      .then((result) => {
        if (!active) return
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setItems(result.items)
        setTotal(result.total)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : l('加载资产失败', 'Failed to load assets'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [assetType, keyword, status, page, pageSize, refreshToken, revision, l])

  const submitSearch = (value: string) => {
    setKeyword(value.trim())
    setPage(1)
    setRevision((value) => value + 1)
  }

  const statusText = (item: StudioAssetLibraryItem) => item.statusName || (item.status === 1
    ? l('可用', 'Available') : item.status === 2 ? l('已停用', 'Disabled') : l('未知状态', 'Unknown status'))

  return (
    <div className="space-y-4">
      <Space wrap>
        <Input.Search value={search} allowClear placeholder={l('搜索资产', 'Search assets')}
          onChange={(event) => {
            setSearch(event.target.value)
            if (!event.target.value) submitSearch('')
          }}
          onSearch={submitSearch} style={{ width: 280 }} />
        <Select<1 | 2> value={status} aria-label={l('资产状态', 'Asset status')} style={{ width: 120 }}
          options={[{ value: 1, label: l('可用', 'Available') }, { value: 2, label: l('已停用', 'Disabled') }]}
          onChange={(value) => { setStatus(value); setPage(1) }} />
        <Button icon={<ReloadOutlined />} onClick={() => setRevision((value) => value + 1)}>
          {l('刷新', 'Refresh')}
        </Button>
      </Space>
      {error ? <Alert type="error" showIcon message={l('加载资产失败', 'Failed to load assets')} description={error}
        action={<Button onClick={() => setRevision((value) => value + 1)}>{l('重试', 'Retry')}</Button>} /> : null}
      <Card loading={loading}>
        <div className="mb-3 text-sm text-gray-500">{l(`本页 ${items.length} 条 / 共 ${total} 条`, `${items.length} on this page / ${total} total`)}</div>
        {!error && items.length === 0 ? <Empty description={keyword ? l('无匹配资产', 'No matching assets') : l('暂无该类资产', 'No assets of this type')} /> : null}
        <Row gutter={[16, 16]}>
          {items.map((item) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={4} key={item.id}>
              <DisplayImageCard title={item.name} imageUrl={coverUrl(item)} imageAlt={item.name}
                placeholder={l('暂无图片', 'No image')}
                extra={<Button type="link" size="small" onClick={() => setDetail(item)}>{l('详情', 'Details')}</Button>}
                meta={<>
                  <div className="text-xs text-gray-500 mb-2 line-clamp-2">{item.description || l('暂无描述', 'No description')}</div>
                  <Space size={[0, 4]} wrap>
                    <Tag color={item.status === 1 ? 'success' : 'default'}>{statusText(item)}</Tag>
                    {item.libraryCode ? <Tag>{item.libraryCode}</Tag> : null}
                    {item.visualStyleName ? <Tag>{item.visualStyleName}</Tag> : null}
                    {Array.from(new Set(formatAssetLibraryTags(item.customTags))).slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </Space>
                </>} />
            </Col>
          ))}
        </Row>
        <div className="flex justify-end pt-4">
          <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[20, 40, 60, 100]}
            onChange={(nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize) }} />
        </div>
      </Card>
      <Modal
        title={<div className="asset-library-detail__title">
          <span className="asset-library-detail__name">{detail?.name}</span>
          {detail ? <Tag color={detail.status === 1 ? 'success' : 'default'}>{statusText(detail)}</Tag> : null}
        </div>}
        className="asset-library-detail"
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        width={1180}
        centered
      >
        {detail ? <div className="asset-library-detail__layout">
          <div className="asset-library-detail__overview">
            <div className="asset-library-detail__image">
              {coverUrl(detail)
                ? <Image src={coverUrl(detail)} alt={detail.name} />
                : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('暂无图片', 'No image')} />}
            </div>
            <div className="asset-library-detail__image-hint">{l('点击图片查看大图', 'Click the image to enlarge')}</div>
            <section className="asset-library-detail__section">
              <h3>{l('基本信息', 'Basic information')}</h3>
              <dl className="asset-library-detail__metadata">
                {[
                  [l('资产编号', 'Library code'), detail.libraryCode],
                  [l('类型', 'Type'), detail.assetTypeName],
                  [l('视觉风格', 'Visual style'), detail.visualStyleName],
                  [l('造型', 'Look'), detail.lookName],
                ].map(([label, value]) => <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '—'}</dd>
                </div>)}
              </dl>
            </section>
          </div>
          <div className="asset-library-detail__content" tabIndex={0} role="region" aria-label={l('资产描述与提示词', 'Asset description and prompt')}>
            <section className="asset-library-detail__section">
              <h3>{l('资产描述', 'Description')}</h3>
              <div className="asset-library-detail__text">{detail.description || l('暂无描述', 'No description')}</div>
            </section>
            <section className="asset-library-detail__section asset-library-detail__prompt">
              <div className="asset-library-detail__section-heading">
                <h3>{l('提示词', 'Prompt')}</h3>
                {detail.prompt ? <Typography.Text copyable={{ text: detail.prompt }}>{l('复制', 'Copy')}</Typography.Text> : null}
              </div>
              <div className="asset-library-detail__text">{detail.prompt || l('暂无提示词', 'No prompt')}</div>
            </section>
          </div>
        </div> : null}
      </Modal>
    </div>
  )
}