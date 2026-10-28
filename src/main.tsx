import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';
import { App } from './App.tsx';
import { applySound } from './audio/sound.ts';
import { camera, world } from './engine/instance.ts';
import { jukebox } from './audio/music.ts';
import { party } from './ui/interact.ts';
import { startTour } from './ui/tour.ts';
import { installCopy } from './ui/md.ts';
import { perf } from './ui/Office.tsx';
import { connect, playReplay } from './net/link.ts';
import { debug } from './engine/debug.ts';
import { weather } from './engine/weather.ts';
import { useOffice } from './state/store.ts';

applySound(useOffice.getState().sound);
installCopy();
// pour les tests et les captures : rejouer une mission depuis la console
(window as unknown as { __bureau: unknown }).__bureau = { playReplay, useOffice, world, perf, camera, jukebox, party, startTour, weather, debug };
connect();
createRoot(document.getElementById('root')!).render(<App />);
