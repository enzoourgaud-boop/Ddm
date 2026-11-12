import { render } from 'preact';
import '@fontsource/sancreek/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/main.css';
import { App } from './ui/App';

render(<App />, document.getElementById('root')!);
