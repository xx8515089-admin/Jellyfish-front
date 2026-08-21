import { Select } from 'antd'
import type { SelectProps } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import './StudioSelect.css'

export default function StudioSelect({
  className,
  popupClassName,
  suffixIcon,
  ...props
}: SelectProps) {
  return (
    <Select
      {...props}
      className={['studio-select', className].filter(Boolean).join(' ')}
      popupClassName={['studio-select__popup', popupClassName].filter(Boolean).join(' ')}
      suffixIcon={suffixIcon ?? <DownOutlined className="studio-select__arrow" />}
    />
  )
}
