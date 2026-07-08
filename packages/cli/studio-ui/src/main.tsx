import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles.css';
import '@xyflow/react/dist/style.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
