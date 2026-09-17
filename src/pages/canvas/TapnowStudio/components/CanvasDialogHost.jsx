import React, { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { Button, ConfigProvider, Input, Modal, theme as antdTheme } from 'antd';
import { canvasDialogStore } from '../canvasDialogs';
import i18n from '../i18n';

function CanvasDialog({ item, language }) {
    const [value, setValue] = useState(String(item.options.defaultValue ?? ''));
    const text = (zh, en) => language === 'en' ? en : zh;
    const t = (message) => i18n.t(message);
    const isAlert = item.type === 'alert';
    const isPrompt = item.type === 'prompt';
    const title = item.options.title || (isAlert ? text('提示', 'Notice') : isPrompt ? text('输入信息', 'Enter information') : text('请确认', 'Please confirm'));
    const submit = () => canvasDialogStore.complete(item.id, isPrompt ? value : isAlert ? undefined : true);
    const cancel = () => canvasDialogStore.complete(item.id, isPrompt ? null : false);
    const inputProps = {
        value,
        autoFocus: true,
        readOnly: item.options.readOnly,
        placeholder: item.options.placeholder,
        'aria-label': title,
        onChange: event => setValue(event.target.value),
        onFocus: event => { if (item.options.readOnly) event.target.select(); },
    };
    return <Modal
        open centered title={title}
        width={item.options.multiline ? 640 : 460}
        zIndex={20000}
        maskClosable={false}
        modalRender={dialog => <div
            data-canvas-interactive="true"
            onKeyDown={event => {
                // Let Modal keep Tab focus inside the dialog.
                if (event.key === 'Tab') return;
                event.stopPropagation();
                if (event.key === 'Escape' && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
                    event.preventDefault();
                    canvasDialogStore.dismiss(item.id);
                }
            }}
            onKeyUp={event => event.stopPropagation()}
            onCopy={event => event.stopPropagation()}
            onCut={event => event.stopPropagation()}
            onPaste={event => event.stopPropagation()}
            onWheel={event => event.stopPropagation()}
        >{dialog}</div>}
        onCancel={() => canvasDialogStore.dismiss(item.id)}
        footer={<>
            {!isAlert && <Button onClick={cancel}>{item.options.cancelText ? t(item.options.cancelText) : text('取消', 'Cancel')}</Button>}
            <Button type="primary" danger={item.options.danger} onClick={submit} autoFocus={!isPrompt}>
                {item.options.okText ? t(item.options.okText) : text('确定', 'OK')}
            </Button>
        </>}
    >
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '55vh', overflowY: 'auto' }}>{item.content}</div>
        {isPrompt && <div style={{ marginTop: 16 }}>
            {item.options.multiline
                ? <Input.TextArea {...inputProps} autoSize={{ minRows: 6, maxRows: 14 }} />
                : <Input {...inputProps} onPressEnter={event => {
                    if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
                    submit();
                }} />}
        </div>}
    </Modal>;
}

export default function CanvasDialogHost({ theme = 'dark', language = 'zh' }) {
    const item = useSyncExternalStore(canvasDialogStore.subscribe, canvasDialogStore.getSnapshot, () => null);
    useLayoutEffect(() => canvasDialogStore.mount(), []);
    return <ConfigProvider theme={{
        inherit: false,
        components: { Modal: { headerBg: 'transparent' } },
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: theme === 'dark' ? '#8caee8' : '#466aa9',
            ...(theme === 'solarized' ? { colorBgBase: '#fdf6e3', colorBgElevated: '#fffaf0', colorText: '#586e75' } : {}),
            borderRadius: 8,
        },
    }}>
        {item && <CanvasDialog key={item.id} item={item} language={language} />}
    </ConfigProvider>;
}
