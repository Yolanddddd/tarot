import { useEffect, useMemo, useState } from 'react';
import { buildTarotCardFallbackDataUrl, resolveTarotCardFaceSource } from '../tarot/cardArt';

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
  const [src, setSrc] = useState(fallbackSrc);

  useEffect(() => {
    let cancelled = false;

    setSrc(fallbackSrc);

    void resolveTarotCardFaceSource({ id: cardId, label }).then((resolvedSrc) => {
      if (!cancelled) {
        setSrc(resolvedSrc);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cardId, fallbackSrc, label]);

  return (
    <img
      alt={alt}
      className={className}
      onError={() => {
        setSrc(fallbackSrc);
      }}
      src={src}
    />
  );
}
