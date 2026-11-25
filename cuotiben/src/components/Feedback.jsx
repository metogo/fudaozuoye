import { assetBase } from '../core/host.js';
import React, { useEffect, useRef, useState } from 'react';
import posters from '../core/motion-posters.js';
const stills = Object.fromEntries(
  Object.entries(posters).map(([name, svg]) => [name, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)]),
);
export default function Feedback({ kind, enabled = true, onReady }) {
  const ref = useRef(null),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    const pref = matchMedia('(prefers-reduced-motion: reduce)'),
      abort = new AbortController();
    let animation;
    function stop() {
      abort.abort();
      animation?.destroy();
      setPlaying(false);
    }
    async function play() {
      if (!enabled || pref.matches) return;
      try {
        const [module, res] = await Promise.all([
          import('lottie-web/build/player/esm/lottie_light.min.js'),
          fetch(assetBase + 'motion/' + kind + '.json', { signal: abort.signal }),
        ]);
        if (!res.ok) throw Error('动效资源未加载');
        const data = await res.json();
        if (abort.signal.aborted || pref.matches) return;
        animation = module.default.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: data,
        });
        animation.addEventListener('DOMLoaded', () => {
          if (!abort.signal.aborted) {
            onReady?.(animation);
            setPlaying(true);
            animation.play();
          }
        });
        animation.addEventListener('data_failed', stop);
      } catch {
        if (!abort.signal.aborted) stop();
      }
    }
    function restore(event) {
      if (event.persisted && kind === 'opening' && !pref.matches) animation?.goToAndPlay(0, true);
    }
    play();
    if (kind === 'opening') window.addEventListener('pageshow', restore);
    pref.addEventListener('change', stop);
    return () => {
      abort.abort();
      animation?.destroy();
      window.removeEventListener('pageshow', restore);
      pref.removeEventListener('change', stop);
    };
  }, [kind, enabled, onReady]);
  return (
    <div aria-hidden="true" className="result-motion">
      <img alt="" hidden={playing} src={stills[kind]} />
      <span ref={ref} />
    </div>
  );
}
