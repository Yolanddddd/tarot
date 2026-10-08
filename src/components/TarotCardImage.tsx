import { useEffect, useMemo, useState } from 'react';
import { buildTarotCardFallbackDataUrl, getDefaultTarotCardFaceSource, resolveTarotCardFaceSource } from '../tarot/cardArt';

interface TarotCardImageProps {
  cardId: string;
  label: string;
  alt: string;
  className?: string;
}

export function TarotCardImage({
  cardId,
  label,
  alt,
  className
}: TarotCardImageProps) {
  const fallbackSrc = useMemo(() => buildTarotCardFallbackDataUrl(label), [label]);
  const defaultSrc = useMemo(() => getDefaultTarotCardFaceSource(cardId), [cardId]);
  const [src, setSrc] = useState(defaultSrc);

  useEffect(() => {
    let cancelled = false;

    setSrc(defaultSrc);

    void resolveTarotCardFaceSource({ id: cardId, label }).then((resolvedSrc) => {
      if (!cancelled) {
        setSrc(resolvedSrc);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cardId, defaultSrc, label]);

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      onError={() => {
        if (src !== fallbackSrc) setSrc(fallbackSrc);
      }}
      src={src}
    />
  );
}
