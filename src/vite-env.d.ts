/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
declare const __LOCAL_GUO_ASSETS_AVAILABLE__: boolean
declare const __LOCAL_MIXAMO_CHARACTER_AVAILABLE__: boolean
declare const __LOCAL_MIXAMO_ANIMATIONS_AVAILABLE__: boolean
