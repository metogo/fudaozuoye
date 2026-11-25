import { useEffect, useState } from 'react';
import { list } from './book.ts';
export function useNotebook() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let version = 0,
      active = true;
    async function refresh() {
      const run = ++version;
      try {
        const result = await list();
        if (active && version === run) {
          setRows(result);
          setError('');
        }
      } catch {
        if (active && version === run) setError('无法读取本地错题本。请允许网站使用本地存储后刷新。');
      } finally {
        if (active && version === run) setLoading(false);
      }
    }
    refresh();
    window.addEventListener('bookchange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('bookchange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return { rows, error, loading };
}
