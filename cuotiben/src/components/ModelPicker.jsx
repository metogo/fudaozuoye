import { assetBase, notebookApi } from '../core/host.js';
import React, { useEffect, useState } from 'react';
import { models } from '../../shared/models.js';

// Brand artwork from @lobehub/icons-static-svg 1.104.0, licensed in public/brand/models.
const brands = {
  doubao: ['豆包', 'doubao-color'],
  openai: ['GPT', 'openai'],
  anthropic: ['Claude', 'claude-color'],
  google: ['Gemini', 'gemini-color'],
  deepseek: ['DeepSeek', 'deepseek-color'],
};
const options = [{ id: 'doubao', name: '豆包' }, ...models].map(model => {
  const [label, file] = brands[model.id.split('/')[0]];
  return { ...model, label, icon: assetBase + 'brand/models/' + file + '.svg' };
});

export default function ModelPicker({ selected, change, ask, hasChild }) {
  const [available, setAvailable] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(notebookApi, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const body = await response.json();
        if (!Array.isArray(body.models)) throw Error();
        setAvailable(body.models.map((model) => model.id));
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable([]);
      });
    return () => controller.abort();
  }, []);
  const current = options.find(option => option.id === selected);
  function choose(option, trigger) {
    if (option.id === selected) return;
    ask({
      title: '用 ' + option.name + ' 重新解析？',
      symbolImage: option.icon,
      text: `当前使用「${current.name}」。确认后，会把这道题的题干${hasChild ? '和孩子的原作答' : ''}发给「${option.name}」，生成新的讲解。`,
      cancel: '暂不切换',
      yes: '重新解析',
      resume: () => requestAnimationFrame(() => trigger.focus({ preventScroll: true })),
      go: () => change(option.id),
    });
  }
  return (
    <section className="reader-model" aria-labelledby="model-heading">
      <header className="model-heading">
        <h2 id="model-heading">讲解模型</h2>
        <span>当前 · {current.name}</span>
      </header>
      <div className="model-options" role="group" aria-labelledby="model-heading">
        {options.map(option => {
          const active = option.id === selected;
          const unavailable = option.id !== 'doubao' && !available?.includes(option.id);
          return (
            <button key={option.id} type="button" className="model-option" value={option.id}
              aria-label={option.name} aria-pressed={active} aria-haspopup={active ? undefined : 'dialog'}
              disabled={!active && unavailable} title={option.name}
              onClick={event => choose(option, event.currentTarget)}>
              <span className="model-mark"><img src={option.icon} width="26" height="26" alt="" /></span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {available?.length === 0 && <small role="status">其他模型暂不可用</small>}
    </section>
  );
}
