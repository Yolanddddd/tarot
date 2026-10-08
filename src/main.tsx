import { createRoot } from 'react-dom/client';
import '@fontsource/cinzel-decorative/latin-400.css';
import '@fontsource/cinzel-decorative/latin-700.css';
import '@fontsource/noto-serif-sc/chinese-simplified-400.css';
import '@fontsource/noto-serif-sc/chinese-simplified-500.css';
import '@fontsource/noto-serif-sc/chinese-simplified-600.css';
import '@fontsource/noto-serif-sc/chinese-simplified-700.css';
import '@fontsource/noto-serif-sc/latin-400.css';
import '@fontsource/noto-serif-sc/latin-500.css';
import '@fontsource/noto-serif-sc/latin-600.css';
import '@fontsource/noto-serif-sc/latin-700.css';
import App from './App';
import './styles.css';
import './desktop/desktop.css';

createRoot(document.getElementById('root')!).render(<App />);
