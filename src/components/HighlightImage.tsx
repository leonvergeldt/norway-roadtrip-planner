import { useEffect, useState } from "react";
import { categoryImages } from "../data/highlights";
import type { Highlight } from "../types";

interface HighlightImageProps {
  highlight: Highlight;
  className?: string;
  showCredit?: boolean;
}

export function HighlightImage({ highlight, className, showCredit = false }: HighlightImageProps) {
  const fallbackSrc = categoryImages[highlight.category];
  const preferredSrc = highlight.imageUrl ?? fallbackSrc;
  const [src, setSrc] = useState(preferredSrc);

  useEffect(() => {
    setSrc(preferredSrc);
  }, [preferredSrc, highlight.id]);

  const isFallback = src === fallbackSrc && preferredSrc !== fallbackSrc;
  const credit = isFallback ? "Offline sfeerbeeld" : highlight.imageCredit;

  return (
    <>
      <img
        className={className}
        src={src}
        alt={highlight.imageAlt ?? highlight.name}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== fallbackSrc) setSrc(fallbackSrc);
        }}
      />
      {showCredit && credit && <small className="image-credit">{credit}</small>}
    </>
  );
}
