import React, { useState } from 'react';
import { Icon } from './UI.jsx';

function space(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MiB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GiB';
}

export default function StorageInfo() {
  const [info, setInfo] = useState('');
  async function opened(event) {
    if (!event.currentTarget.open) return;
    if (!navigator.storage?.estimate) {
      setInfo('这个浏览器没有提供空间估算。');
      return;
    }
    try {
      const { usage, quota } = await navigator.storage.estimate();
      setInfo(
        Number.isFinite(usage) && Number.isFinite(quota)
          ? '本站已用约 ' + space(usage) + '，浏览器估算总额度 ' + space(quota) + '。'
          : '这个浏览器没有提供空间估算。',
      );
    } catch {
      setInfo('暂时无法读取浏览器的空间估算。');
    }
  }
  return (
    <details className="storage-info" onToggle={opened}>
      <summary>
        <Icon name="lock" />
        本机存储与可用空间
      </summary>
      <p>{info}</p>
      {import.meta.env.VITE_TUTOR_HOME && <p>用过独立版？之前收录的题仍保存在原网址。<a href="https://cuotiben-orpin.vercel.app/">打开旧版题本</a></p>}
      <p>
        清除本站数据会清空本子。照片题只存圈出的部分。可存题数随图片大小和设备剩余空间变化。请用同一浏览器和网址回看。
      </p>
    </details>
  );
}
