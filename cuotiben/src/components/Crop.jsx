import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Feedback from './Feedback.jsx';
import { Icon } from './UI.jsx';
const whole = { x: 0, y: 0, w: 1, h: 1 };

function suggestedRegion(last) {
  if (!last || last.w * last.h > 0.9) return whole;
  const below = last.y + last.h + 0.01;
  const y = below + last.h <= 1 ? below : Math.max(0, last.y - last.h - 0.01);
  return { ...last, y };
}

export default function Crop({ photo, box, setBox, marks, accept, error, notice, receipt }) {
  const ref = useRef(null),
    geom = useRef(null),
    gesture = useRef(null),
    touches = useRef(new Map());
  const [img, image] = useState(null),
    [view, viewTo] = useState({ z: 1, x: 0, y: 0 }),
    [tick, refresh] = useState(0);
  useEffect(() => {
    const i = new Image();
    let active = true;
    i.onload = () => {
      if (active) image(i);
    };
    i.onerror = () => {
      if (active) notice('图片无法打开，请返回选择另一张图片。');
    };
    i.src = photo.src;
    return () => {
      active = false;
    };
  }, [photo.src]);
  useLayoutEffect(() => {
    const ob = new ResizeObserver(() => refresh((v) => v + 1));
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);
  const region = box || suggestedRegion(marks.at(-1));
  const full = region.w === 1 && region.h === 1;
  useDrawing({ img, ref, geom, view, box: region, showHandles: Boolean(box) && !full, marks, tick });
  const { down, move, stop } = gestures({ ref, geom, touches, gesture, view, viewTo, box, setBox, region });
  function useRegion(r, manual = false) {
    if (!img) return;
    const c = document.createElement('canvas'),
      sw = r.w * img.width,
      sh = r.h * img.height,
      t = Math.min(1, 900 / sw, 900 / sh);
    c.width = Math.max(1, Math.round(sw * t));
    c.height = Math.max(1, Math.round(sh * t));
    c.getContext('2d').drawImage(img, r.x * img.width, r.y * img.height, sw, sh, 0, 0, c.width, c.height);
    accept(r, c.toDataURL('image/jpeg', 0.78), manual);
  }
  return (
    <>
      <div className="crop-bench">
        <div className="bench-caption">
          {receipt ? (
            <div className="collection-feedback" role="status"><Feedback kind="collected" />{receipt}</div>
          ) : <span><Icon name="frame" />选取题目</span>}
          <div className="crop-tools">
            {!full && <button className="link" onClick={() => setBox(whole)}>选整张</button>}
            {view.z > 1 && <button className="link" onClick={() => viewTo({ z: 1, x: 0, y: 0 })}>适应整页</button>}
          </div>
        </div>
        <div className="cropstage">
          <canvas
            ref={ref}
            aria-label="作业照片圈题区域"
            data-ready={img ? "true" : "false"}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
        </div>
      </div>
      <p className="crop-guidance">{full ? '已选整张。照片里有多题时，拖一下圈出要收的那道。' : !box ? '沿用上一题的框大小。点下一题移框，或直接拖出新框。' : '拖角调大小，点题目可移框，双指可放大。'}</p>
      {error && (
        <p className="alert" role="alert">
          {error}
          {img && box?.w >= 0.015 && box?.h >= 0.015 && (
            <button className="link manual-transcript" onClick={() => useRegion(box, true)}>
              对照选区手动填写
            </button>
          )}
        </p>
      )}
      <details className="send-notice">
        <summary>点击解析即将{full ? '整张照片' : '框内图片'}发给豆包识别并解析，请避开姓名。</summary>
        <p>错题本仅在本次解析请求中转发选区。若服务账户启用调用日志，图片可能按日志设置留存，合规审查记录按适用要求保留。 <a href="https://docs.volcengine.com/docs/ark/volcengine-ark-platform-terms?lang=zh" target="_blank" rel="noreferrer">查看数据条款</a></p>
      </details>
      <div className="footer-act">
        <button
          className="primary"
          disabled={!img || region.w < 0.015 || region.h < 0.015}
          onClick={() => useRegion(region)}
        >
          {full ? '解析整张图' : '解析框内题目'}
        </button>
      </div>
    </>
  );
}

function useDrawing({ img, ref, geom, view, box, showHandles, marks, tick }) {
  useLayoutEffect(() => {
    if (!img) return;
    const c = ref.current,
      { width: W, height: H } = c.getBoundingClientRect(),
      scale = Math.min((W - 16) / img.width, (H - 16) / img.height) * view.z;
    const w = img.width * scale,
      h = img.height * scale,
      ox = (W - w) / 2 + view.x,
      oy = (H - h) / 2 + view.y;
    geom.current = { ox, oy, w, h };
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.drawImage(img, ox, oy, w, h);
    marks.forEach((r, i) => {
      g.strokeStyle = '#a9edff';
      g.lineWidth = 2;
      g.strokeRect(ox + r.x * w, oy + r.y * h, r.w * w, r.h * h);
      g.fillStyle = '#284b67';
      g.fillRect(ox + r.x * w, oy + r.y * h, 75, 19);
      g.fillStyle = 'white';
      g.font = '12px sans-serif';
      g.fillText('已收录 ' + (i + 1), ox + r.x * w + 6, oy + r.y * h + 14);
    });
    if (box) {
      const x = ox + box.x * w,
        y = oy + box.y * h,
        bw = box.w * w,
        bh = box.h * h;
      g.save();
      g.beginPath();
      g.rect(ox, oy, w, h);
      g.rect(x, y, bw, bh);
      g.fillStyle = 'rgba(21,33,52,.48)';
      g.fill('evenodd');
      g.restore();
      g.strokeStyle = '#15766b';
      g.lineWidth = 2;
      g.strokeRect(x, y, bw, bh);
      for (const dx of showHandles ? [0, bw] : [])
        for (const dy of [0, bh]) {
          const cx = x + dx,
            cy = y + dy;
          g.beginPath();
          g.arc(cx, cy, 5, 0, Math.PI * 2);
          g.fillStyle = '#fff';
          g.fill();
          g.stroke();
        }
      g.shadowBlur = 0;
    }
  }, [img, box, showHandles, marks, view, tick]);
}
function gestures({ ref, geom, touches, gesture, view, viewTo, box, setBox, region }) {
  const clip = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  function local(e) {
    const r = ref.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function norm(p) {
    const { ox, oy, w, h } = geom.current;
    return { x: clip((p.x - ox) / w), y: clip((p.y - oy) / h) };
  }
  function pair() {
    const [a, b] = [...touches.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, len: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  function down(e) {
    if (!geom.current || touches.current.size >= 2) return;
    ref.current.setPointerCapture(e.pointerId);
    const at = local(e);
    touches.current.set(e.pointerId, at);
    if (touches.current.size === 2) {
      if (gesture.current) setBox(gesture.current.original);
      gesture.current = { mode: 'zoom', pair: pair(), view };
      return;
    }
    const p = norm(at),
      g = geom.current;
    let mode = 'draw',
      anchor = p;
    if (box && region.w * region.h < 1) {
      for (const dx of [0, 1])
        for (const dy of [0, 1]) {
          if (Math.abs((region.x + dx * region.w - p.x) * g.w) < 21 && Math.abs((region.y + dy * region.h - p.y) * g.h) < 21) {
            mode = 'corner';
            anchor = { x: region.x + (1 - dx) * region.w, y: region.y + (1 - dy) * region.h };
          }
        }
      if (mode === 'draw' && p.x > region.x && p.x < region.x + region.w && p.y > region.y && p.y < region.y + region.h) mode = 'move';
    }
    gesture.current = { mode, anchor, start: p, original: box, region, at };
  }
  function move(e) {
    if (!touches.current.has(e.pointerId) || !gesture.current) return;
    const at = local(e);
    touches.current.set(e.pointerId, at);
    const s = gesture.current;
    if (s.mode === 'zoom' && touches.current.size === 2) {
      const a = pair(),
        v = s.view,
        z = clip((v.z * a.len) / s.pair.len, 1, 4),
        ratio = z / v.z,
        r = ref.current.getBoundingClientRect();
      const x = a.x - r.width / 2 - (s.pair.x - r.width / 2 - v.x) * ratio,
        y = a.y - r.height / 2 - (s.pair.y - r.height / 2 - v.y) * ratio;
      viewTo({
        z,
        x: z === 1 ? 0 : clip(x, (-r.width * z) / 2, (r.width * z) / 2),
        y: z === 1 ? 0 : clip(y, (-r.height * z) / 2, (r.height * z) / 2),
      });
      return;
    }
    if (Math.hypot(at.x - s.at.x, at.y - s.at.y) < 4 && !s.dragged) return;
    s.dragged = true;
    const p = norm(at),
      a = s.anchor;
    if (s.mode === 'move') {
      const b = s.region;
      setBox({ ...b, x: clip(b.x + p.x - s.start.x, 0, 1 - b.w), y: clip(b.y + p.y - s.start.y, 0, 1 - b.h) });
    } else if (s.mode === 'draw' || s.mode === 'corner')
      setBox({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(a.x - p.x), h: Math.abs(a.y - p.y) });
  }
  function stop(e) {
    if (!touches.current.delete(e.pointerId)) return;
    const s = gesture.current;
    if (s && e.type === 'pointerup' && s.mode !== 'zoom' && !s.dragged && region.w * region.h < 1) {
      setBox({ ...region, x: clip(s.start.x - region.w / 2, 0, 1 - region.w), y: clip(s.start.y - region.h / 2, 0, 1 - region.h) });
    }
    gesture.current = null;
  }

  return { down, move, stop };
}
