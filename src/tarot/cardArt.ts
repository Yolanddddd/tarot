import { runtimeConfig } from '../config/runtime';

interface CardAssetManifest {
  cards?: Record<string, string>;
}

interface CardLookup {
  id: string;
  label: string;
}

let manifestPromise: Promise<CardAssetManifest> | null = null;

export async function resolveTarotCardFaceSource(card: CardLookup) {
  const manifest = await loadCardAssetManifest();
  const configuredPath = manifest.cards?.[card.id];

  if (configuredPath) {
    return normalizeAssetPath(configuredPath);
  }

  return normalizeAssetPath(`${card.id}.jpg`);
}

export function buildTarotCardFallbackDataUrl(label: string) {
  const title = escapeXml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 720">
      <defs>
        <linearGradient id="aura-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f6efd9" />
          <stop offset="52%" stop-color="#dfd0a5" />
          <stop offset="100%" stop-color="#bfa263" />
        </linearGradient>
      </defs>
      <rect width="420" height="720" rx="24" fill="url(#aura-bg)" />
      <rect x="20" y="20" width="380" height="680" rx="18" fill="none" stroke="#6c5530" stroke-width="6" />
      <rect x="42" y="42" width="336" height="636" rx="12" fill="rgba(255,255,255,0.38)" stroke="#8d7241" stroke-width="2" />
      <circle cx="210" cy="172" r="68" fill="#fff5d7" stroke="#8d7241" stroke-width="5" />
      <path d="M210 104 L228 156 L284 156 L238 188 L254 242 L210 210 L166 242 L182 188 L136 156 L192 156 Z" fill="#d7a834" />
      <text x="210" y="450" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="28" fill="#3f2f1c">${title}</text>
      <text x="210" y="502" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="16" fill="#6b5431">Rider-Waite Placeholder</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function loadCardAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(runtimeConfig.cards.manifestPath, {
      cache: 'no-cache'
    })
      .then(async (response) => {
        if (!response.ok) {
          return {} as CardAssetManifest;
        }

        return (await response.json()) as CardAssetManifest;
      })
      .catch(() => ({} as CardAssetManifest));
  }

  return manifestPromise;
}

function normalizeAssetPath(assetPath: string) {
  if (
    assetPath.startsWith('http://') ||
    assetPath.startsWith('https://') ||
    assetPath.startsWith('data:') ||
    assetPath.startsWith('/')
  ) {
    return assetPath;
  }

  const basePath = runtimeConfig.cards.assetBasePath.replace(/\/$/, '');
  const normalizedPath = assetPath.replace(/^\.\//, '');
  return `${basePath}/${normalizedPath}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
