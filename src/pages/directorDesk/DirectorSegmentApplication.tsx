import { useState } from 'react'
import { Alert, Button, Modal, message } from 'antd'
import { StudioDirectorDesks as api, type DirectorApplication } from '../../services/studioDirectorDesks'
import { getApiErrorMessage } from '../../services/apiErrors'
import DirectorCaptureImageForm from './DirectorCaptureImageForm'
import './DirectorSegmentApplication.css'

export default function DirectorSegmentApplication({ segmentId, visualStyleId }: { segmentId: string; visualStyleId: number | null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [application, setApplication] = useState<DirectorApplication | null>(null)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  return <>
    <Button loading={busy} onClick={async () => {
      setBusy(true)
      try {
        const { image } = await api.segmentApplications(segmentId)
        if (image.directorDeskId != null && image.directorRevisionNo != null) {
          const desk = await api.detail(image.directorDeskId, image.directorRevisionNo)
          setAspectRatio(desk.viewSettings.viewportAspectRatio)
        }
        setApplication(image); setOpen(true)
      } catch (error) { message.error(getApiErrorMessage(error)) }
      finally { setBusy(false) }
    }}>导演台图片参考</Button>
    <Modal className="director-segment-application-modal" width={620} centered title="片段已应用的导演台图片" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
      {application?.fileId != null ? <DirectorCaptureImageForm
        key={`${segmentId}-${application.applicationRevisionNo}`}
        segmentId={segmentId} visualStyleId={visualStyleId} aspectRatio={aspectRatio} includeCharacters={application.imageReferences.some((item) => item.referenceType === 1)}
        bindings={[]} savedReferences={application.imageReferences}
        reference={application.imageReferences.find((item) => String(item.fileId) === String(application.fileId))!}
      /> : <Alert type="info" message="尚未应用导演台垫图，请在导演台导出并应用到片段图片。" />}
    </Modal>
  </>
}
