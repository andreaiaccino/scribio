import type { ScribioApi } from '@shared/types'

declare global {
  interface Window {
    scribio: ScribioApi
  }
}

export {}
