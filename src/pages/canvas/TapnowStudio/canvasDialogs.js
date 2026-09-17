// Canvas-owned dialog queue. Never replace browser globals or leak dialogs into other pages.
export function createCanvasDialogStore() {
    let queue = [];
    let sequence = 0;
    let hosts = 0;
    const listeners = new Set();
    const publish = () => listeners.forEach(listener => listener());
    const dismissedValue = item => item.type === 'prompt' ? null : item.type === 'confirm'
        ? (Object.prototype.hasOwnProperty.call(item.options, 'dismissValue') ? item.options.dismissValue : false)
        : undefined;
    const dismissAll = () => {
        const pending = queue;
        queue = [];
        publish();
        pending.forEach(item => item.resolve(dismissedValue(item)));
    };
    return {
        getSnapshot: () => queue[0] || null,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        mount() {
            hosts++;
            return () => {
                hosts = Math.max(0, hosts - 1);
                if (!hosts) dismissAll();
            };
        },
        request(type, content, options = {}) {
            if (!hosts) return Promise.resolve(dismissedValue({ type, options }));
            if (type === 'alert') {
                const existing = queue.find(item => item.type === type && item.content === content &&
                    item.options.title === options.title && item.options.tone === options.tone);
                if (existing) return existing.promise;
            }
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            queue = [...queue, { id: ++sequence, type, content, options, resolve, promise }];
            publish();
            return promise;
        },
        complete(id, value) {
            if (queue[0]?.id !== id) return;
            const [item, ...remaining] = queue;
            queue = remaining;
            publish();
            item.resolve(value);
        },
        dismiss(id) {
            const item = queue[0];
            if (item?.id === id) this.complete(id, dismissedValue(item));
        },
        dismissAll,
    };
}

export const canvasDialogStore = createCanvasDialogStore();
export const canvasAlert = (content, options) => canvasDialogStore.request('alert', content, options);
export const canvasConfirm = (content, options) => canvasDialogStore.request('confirm', content, options);
export const canvasPrompt = (content, defaultValue = '', options = {}) =>
    canvasDialogStore.request('prompt', content, { ...options, defaultValue });
