import './style.css';
import { App } from './app';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  const app = new App(root);
  // Exposed for browser tests.
  (window as unknown as { lamosaic: App }).lamosaic = app;
}
