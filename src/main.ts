import type { MiniType } from './mini/config';
const path = location.pathname.split('/').filter(Boolean)[0];
const routes: Record<string, MiniType> = { 'lucky-wheel': 'wheel', 'lucky-chests': 'chests', 'shooting-targets': 'targets', 'scratch-card': 'scratch' };
if (path === 'shooting-targets') void import('./mini/targets-app').then(({mountTargets})=>mountTargets());
else if (routes[path]) void import('./mini/mini-app').then(({ mountMiniGame }) => mountMiniGame(routes[path]));
else void import('./slot-app');
