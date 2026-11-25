import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
export default function Formula({ source, display }) {
  const markup = useMemo(
    () =>
      katex.renderToString(source, {
        displayMode: display,
        output: 'htmlAndMathml',
        throwOnError: false,
        trust: false,
        errorColor: 'currentColor',
        maxExpand: 500,
        maxSize: 12,
      }),
    [source, display],
  );
  return (
    <span className={display ? 'formula formula-block' : 'formula'} dangerouslySetInnerHTML={{ __html: markup }} />
  );
}
