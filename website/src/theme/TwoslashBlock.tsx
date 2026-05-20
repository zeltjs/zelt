import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TwoslashBlockProps {
  lang?: string;
  'data-twoslash-html'?: string;
  'data-plain-html'?: string;
  // Fallback for camelCase variants
  dataTwoslashHtml?: string;
  dataPlainHtml?: string;
}

const decodeBase64 = (encoded: string): string => {
  try {
    if (typeof window === 'undefined') {
      return Buffer.from(encoded, 'base64').toString('utf-8');
    }
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
};

export const TwoslashBlock = (props: TwoslashBlockProps): ReactNode => {
  const encodedTwoslash = props['data-twoslash-html'] ?? props.dataTwoslashHtml ?? '';
  const encodedPlain = props['data-plain-html'] ?? props.dataPlainHtml ?? '';

  const plainHtml = decodeBase64(encodedPlain);
  const twoslashHtml = decodeBase64(encodedTwoslash);
  const [hydrated, setHydrated] = useState(false);
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHydrated(true);
  }, []);

  const renderHtml = hydrated ? twoslashHtml : plainHtml;
  const className = hydrated ? 'twoslash-block twoslash-hydrated' : 'twoslash-block twoslash-ssr';

  return (
    <pre
      ref={containerRef}
      tabIndex={0}
      className={className}
      data-twoslash-html={encodedTwoslash}
      dangerouslySetInnerHTML={{ __html: renderHtml }}
    />
  );
};

export default TwoslashBlock;
