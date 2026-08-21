const DEFAULT_WORKSPACE_ID = 'default'

const initialWorkspaceId = () => {
    if (typeof window === 'undefined') return DEFAULT_WORKSPACE_ID
    return new URLSearchParams(window.location.search).get('workspace') || DEFAULT_WORKSPACE_ID
}

let activeWorkspaceId = initialWorkspaceId()
let activeOnChanged = null

const getStoragePrefix = (workspaceId) =>
    `jellyfish_canvas:${encodeURIComponent(workspaceId || DEFAULT_WORKSPACE_ID)}:`

const createChangeNotifier = (getOnChanged) => {
    let timer = null
    return () => {
        if (typeof window === 'undefined') return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
            const onChanged = getOnChanged()
            if (typeof onChanged === 'function') onChanged()
        }, 250)
    }
}

const createStorageAdapter = (getWorkspaceId, getOnChanged) => {
    const notifyChanged = createChangeNotifier(getOnChanged)
    const scopedKeys = () => {
        const storage = window.localStorage
        const prefix = getStoragePrefix(getWorkspaceId())
        const keys = []
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index)
            if (key && key.startsWith(prefix)) keys.push(key)
        }
        return keys
    }

    return {
        get length() {
            return scopedKeys().length
        },
        getItem(key) {
            return window.localStorage.getItem(`${getStoragePrefix(getWorkspaceId())}${String(key)}`)
        },
        setItem(key, value) {
            window.localStorage.setItem(
                `${getStoragePrefix(getWorkspaceId())}${String(key)}`,
                String(value),
            )
            notifyChanged()
        },
        removeItem(key) {
            window.localStorage.removeItem(`${getStoragePrefix(getWorkspaceId())}${String(key)}`)
            notifyChanged()
        },
        clear() {
            scopedKeys().forEach((key) => window.localStorage.removeItem(key))
            notifyChanged()
        },
        key(index) {
            const key = scopedKeys()[index]
            return key ? key.slice(getStoragePrefix(getWorkspaceId()).length) : null
        },
    }
}

export const configureCanvasRuntime = (workspaceId, onChanged) => {
    activeWorkspaceId = workspaceId || DEFAULT_WORKSPACE_ID
    activeOnChanged = onChanged || null
}

export const createCanvasStorage = (workspaceId, onChanged) =>
    createStorageAdapter(() => workspaceId || DEFAULT_WORKSPACE_ID, () => onChanged)

export const activeCanvasStorage = createStorageAdapter(
    () => activeWorkspaceId,
    () => activeOnChanged,
)

export const getCanvasDatabaseName = (name) =>
    `${getStoragePrefix(activeWorkspaceId)}${name}`
