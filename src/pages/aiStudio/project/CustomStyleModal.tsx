import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Upload, message } from 'antd'
import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useBilingualText } from '../../../i18n/useBilingualText'
import ImageCropModal from './ImageCropModal'
import type { CropImageSource } from './ImageCropModal'
import './CustomStyleModal.css'

export type CustomStyleCategory = 'visual' | 'tone'

export type CustomStyleDraft = {
  name: string
  prompt: string
  description: string
  previewDataUrl?: string
}

type CustomStyleModalProps = {
  open: boolean
  category: CustomStyleCategory
  onCancel: () => void
  onApply: (draft: CustomStyleDraft) => void | Promise<void>
}

type CustomStyleFormValues = Pick<CustomStyleDraft, 'name' | 'prompt' | 'description'>

const MAX_IMAGE_SIZE = 2 * 1024 * 1024

export default function CustomStyleModal({ open, category, onCancel, onApply }: CustomStyleModalProps) {
  const l = useBilingualText()
  const [form] = Form.useForm<CustomStyleFormValues>()
  const [previewDataUrl, setPreviewDataUrl] = useState<string>()
  const [previewName, setPreviewName] = useState('')
  const [cropSource, setCropSource] = useState<CropImageSource>()
  const isTone = category === 'tone'
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    setPreviewDataUrl(undefined)
    setPreviewName('')
    setCropSource(undefined)
    setSubmitting(false)
  }, [form, open, category])

  const handleImage = (file: File) => {
    const isSupported = file.type === 'image/png' || file.type === 'image/jpeg'
    if (!isSupported) {
      message.error(l('仅支持 PNG、JPG 格式', 'Only PNG and JPG files are supported'))
      return Upload.LIST_IGNORE
    }
    if (file.size > MAX_IMAGE_SIZE) {
      message.error(l('图片大小不能超过 2MB', 'The image must be no larger than 2MB'))
      return Upload.LIST_IGNORE
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setCropSource({ dataUrl: reader.result, fileName: file.name, mimeType: file.type })
    }
    reader.readAsDataURL(file)
    return Upload.LIST_IGNORE
  }

  const handleApply = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      await onApply({ ...values, previewDataUrl })
    } catch (error) {
      if (!(error as { errorFields?: unknown }).errorFields) throw error
    } finally {
      setSubmitting(false)
    }
  }

  const title = isTone ? l('新建影调风格', 'Create tone style') : l('新建画面风格', 'Create visual style')
  const nameLabel = isTone ? l('影调名称', 'Tone name') : l('风格名称', 'Style name')
  const promptLabel = isTone ? l('影调提示词', 'Tone prompt') : l('风格提示词', 'Style prompt')
  const promptPlaceholder = isTone
    ? l('请输入影调提示词', 'Enter tone prompt')
    : l('请输入风格提示词', 'Enter style prompt')

  return (
    <>
      <Modal
      open={open}
      centered
      width={700}
      footer={null}
      closable={false}
      destroyOnClose
      maskClosable={false}
      className="custom-style-modal"
      onCancel={() => { if (!submitting) onCancel() }}
    >
      <div className="custom-style-modal__header">
        <div className="custom-style-modal__heading">
          <h2>{title}</h2>
          <span className="custom-style-modal__heading-note">
            {l('可前往「', 'Manage later from ')}
            <Link to="/prompts" onClick={onCancel}>{l('Prompt定制', 'Prompt Customization')}</Link>
            {l('」页面进行管理', '')}
          </span>
        </div>
        <button type="button" className="custom-style-modal__close" disabled={submitting} aria-label={l('关闭', 'Close')} onClick={onCancel}>
          <CloseOutlined />
        </button>
      </div>

      <Form form={form} layout="vertical" requiredMark className="custom-style-modal__form">
        <div className="custom-style-modal__content">
          <div className="custom-style-modal__fields">
            <Form.Item
              name="name"
              label={nameLabel}
              rules={[
                { required: true, message: l('请输入风格名称', 'Enter a style name') },
                { max: 5, message: l('风格名称最多 5 个字', 'Use no more than 5 characters') },
              ]}
            >
              <Input maxLength={5} placeholder={l('请输入名称，最多5个字', 'Enter a name, up to 5 characters')} />
            </Form.Item>

            <Form.Item
              name="prompt"
              label={promptLabel}
              rules={[{ required: true, message: l('请输入风格提示词', 'Enter a style prompt') }]}
            >
              <Input.TextArea
                maxLength={1000}
                showCount
                autoSize={false}
                placeholder={promptPlaceholder}
              />
            </Form.Item>

            <Form.Item
              name="description"
              label={l('描述', 'Description')}
              rules={[{ required: true, message: l('请输入风格描述', 'Enter a style description') }]}
            >
              <Input showCount placeholder={l('一句话描述风格', 'Describe the style in one sentence')} />
            </Form.Item>
          </div>

          <div className="custom-style-modal__preview-field">
            <span className="custom-style-modal__label">{l('风格示意图', 'Style preview')}</span>
            <Upload.Dragger
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              showUploadList={false}
              beforeUpload={(file) => handleImage(file as File)}
              className="custom-style-modal__uploader"
            >
              {previewDataUrl ? (
                <div className="custom-style-modal__image-preview">
                  <img src={previewDataUrl} alt={previewName} />
                  <span>{l('点击或拖拽替换', 'Click or drag to replace')}</span>
                </div>
              ) : (
                <div className="custom-style-modal__upload-empty">
                  <span className="custom-style-modal__upload-icon"><PlusOutlined /></span>
                  <strong>{l('点击或拖拽上传示意图', 'Click or drag to upload')}</strong>
                  <small>{l('仅支持 png/jpg 格式', 'PNG/JPG only')}</small>
                  <small>{l('大小不超过 2MB', 'Up to 2MB')}</small>
                </div>
              )}
            </Upload.Dragger>
          </div>
        </div>

        <div className="custom-style-modal__footer">
          <Button disabled={submitting} onClick={onCancel}>{l('取消', 'Cancel')}</Button>
          <Button type="primary" loading={submitting} onClick={() => void handleApply()}>{l('创建并应用', 'Create and apply')}</Button>
        </div>
      </Form>
      </Modal>

      <ImageCropModal
        open={Boolean(cropSource)}
        source={cropSource}
        onCancel={() => setCropSource(undefined)}
        onConfirm={(dataUrl, fileName) => {
          setPreviewDataUrl(dataUrl)
          setPreviewName(fileName)
          setCropSource(undefined)
        }}
      />
    </>
  )
}
