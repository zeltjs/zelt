import { createRoot } from 'react-dom/client';
import { mountStudio } from './runtime.lib';
import { Root } from './views/root';
import '../style.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing Root container');
const root = createRoot(container);
const dispose = mountStudio({
  render: (model, emit) => root.render(<Root model={model} emit={emit} />),
  fetchSnapshot: async (signal) => {
    const response = await fetch(`${import.meta.env.BASE_URL}snapshot.json`, { signal });
    if (!response.ok) throw new Error(`構造データの取得失敗: HTTP ${response.status}`);
    const input: unknown = await response.json();
    return input;
  },
  readUrl: () => window.location.href,
  writeUrl: (url) => window.history.pushState(null, '', url),
  onPopState: (restore) => {
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  },
});

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    dispose();
    root.unmount();
  });
