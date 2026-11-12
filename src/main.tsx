import { render } from 'preact';
import '@fontsource/sancreek/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/press-start-2p/400.css';
import './styles/main.css';
import './styles/battle.css';
import './styles/boards.css';
import { App } from './ui/App';

render(<App />, document.getElementById('root')!);
