export const runtimeConfig = {
  mediapipe: {
    wasmRoot:
      import.meta.env.VITE_MEDIAPIPE_WASM_ROOT ??
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    handModelPath:
      import.meta.env.VITE_MEDIAPIPE_HAND_MODEL ??
      '/models/hand_landmarker.task'
  },
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
  },
  cards: {
    assetBasePath:
      import.meta.env.VITE_TAROT_CARD_ASSET_BASE ?? '/cards/rider-waite',
    manifestPath:
      import.meta.env.VITE_TAROT_CARD_MANIFEST ??
      '/cards/rider-waite/manifest.json'
  },
  sceneBounds: {
    x: 8.25,
    y: 4.2,
    z: {
      min: -4,
      max: 4
    }
  }
};
