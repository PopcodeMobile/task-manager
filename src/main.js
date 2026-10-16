import './styles/index.css';
// Register base actions first, feature actions second, workspace lifecycle last.
import './actions/actions.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import { bootWorkspace, listenForWorkspaceChanges } from './actions/workspaces.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import { S, D } from './core/store.js';
import { A } from './actions/registry.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';

if (!document.getElementById('sr-live')) {
  const live = document.createElement('div');
  live.id = 'sr-live';
  live.className = 'sr';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
}
const hash = location.hash.slice(1);
const authRoutes = ['login', 'signup', 'forgot', 'reset', 'verify', 'onboarding'];
const route = authRoutes.includes(hash) || ROUTE_NAMES[hash] ? hash : null;
listenForWorkspaceChanges();
bootWorkspace({ route });

// Development tooling only; production builds omit this handle.
if (import.meta.env.DEV) window.__gr8r = { S, D, A, go, render };
