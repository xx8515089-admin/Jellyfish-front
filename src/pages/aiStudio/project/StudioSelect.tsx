import { Select } from 'antd'
import type { SelectProps } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import './StudioSelect.css'

/** Apply an explicit appearance to both the selector and its portaled dropdown. */
export default function StudioSelect({
  className,
  popupClassName,
  suffixIcon,
  appearance,
  ...props
}: SelectProps & { appearance?: 'dark' }) {
  return (
    <Select
      {...props}
      className={['studio-select', appearance && `studio-select--${appearance}`, className].filter(Boolean).join(' ')}
      popupClassName={['studio-select__popup', appearance && `studio-select__popup--${appearance}`, popupClassName].filter(Boolean).join(' ')}
      suffixIcon={suffixIcon ?? <DownOutlined className="studio-select__arrow" />}
    />
  )
}
