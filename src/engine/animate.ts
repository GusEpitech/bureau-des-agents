// Comment un robot se tient : sa pose (assis, debout, bras levés…), l'image de son animation et son regard.
import type { Cat } from './cat.ts';
import type { Actor } from './actor.ts';
import type { Eyes, Pose } from './robots.ts';

/** La pose, le cadre d'animation et le regard d'un robot, d'après ce qu'il fait à l'instant `t`. */
export function animateActor(a: Actor, dt: number, t: number, cat: Cat) {
  a.animT += dt;
  if (a.seated !== a.wasSeated) { a.wasSeated = a.seated; a.squashAt = t; a.squashKind = a.seated ? 'sit' : 'stand'; }
    const recent = t - a.actAt < 9;
  let pose: Pose;
  if (a.doing === 'sofa' || a.doing === 'sleep' || a.doing === 'bench') { pose = 'sit'; a.dir = 'down'; }
  else if (a.cur?.t === 'wait' && a.cur.pose) pose = a.cur.pose;
  else if (a.moving) pose = a.carrying ? 'carry' : 'walk';
  else if (a.doing === 'play') pose = 'type';
  else if (a.angryUntil > t && a.role === 'analyse') { pose = 'fist'; a.dir = 'down'; }
  else if (a.asks > 0) pose = 'raise';
  else if (a.cheerUntil > t) pose = 'cheer';
  else if (a.carrying) pose = 'carry';
  else if (a.seated) {
    if (recent && a.act && ['write', 'edit', 'bash', 'plan'].includes(a.act)) pose = 'type';
    else if (recent) pose = 'read';
    else pose = 'sit';
  } else pose = 'stand';
  if (pose !== a.pose) { a.pose = pose; a.animT = 0; }
  const ft = a.animT;
  switch (pose) {
    case 'walk': a.frame = Math.floor(ft * 8) % 4; break;
    case 'carry': a.frame = a.moving ? Math.floor(ft * 8) % 4 : 0; break;
    case 'type': a.frame = Math.floor(ft * 7) % 2; break;
    case 'cheer': case 'wave': a.frame = Math.floor(ft * 6) % 2; break;
    case 'fist': a.frame = Math.floor(ft * 11) % 2; break;
    case 'raise': a.frame = Math.floor(ft * 3) % 2; break;
    case 'write': a.frame = Math.floor(ft * 5) % 2; break;
    default: a.frame = 0;
  }
  if (pose === 'carry' && a.moving) {
    // en marchant avec sa feuille : on garde la pose « porter », jambes en mouvement
    a.frame = Math.floor(ft * 8) % 4;
  }
  // le regard
  if (t > a.nextBlink) { a.blinkUntil = t + 0.12; a.nextBlink = t + 2.2 + Math.random() * 3.5; }
  if (t > a.nextLook) {
    const opts: Eyes[] = ['left', 'right', 'open', 'open', 'up'];
    a.look = opts[Math.floor(Math.random() * opts.length)];
    a.lookUntil = t + 0.8 + Math.random() * 0.8;
    a.nextLook = t + 2.5 + Math.random() * 3;
  }
  let eyes: Eyes = 'open';
  if (a.angryUntil > t) eyes = 'angry';
  else if (a.happyUntil > t || pose === 'cheer') eyes = 'happy';
  else if (a.sadUntil > t) eyes = 'down';
  else if (pose === 'type') eyes = 'down';
  else if (pose === 'read') eyes = Math.floor(ft * 2.2) % 2 ? 'left' : 'right';
  else if (pose === 'write') eyes = 'up';
  else if (t - a.thinkAt < 2.5 && !a.moving) eyes = 'up';
  else if (a.lookUntil > t && !a.moving) eyes = a.look;
  if (a.lookAheadUntil > t) eyes = a.dir === 'left' ? 'left' : a.dir === 'right' ? 'right' : a.dir === 'up' ? 'up' : 'down';
  if (a.doing === 'notes' || a.doing === 'phone') eyes = 'down';
  else if (a.doing === 'sofa' && cat.onSofa && a.happyUntil <= t && !a.moving) eyes = a.slot === 0 ? 'right' : 'left'; // il regarde le chat dormir
  if (a.blinkUntil > t && eyes !== 'happy' && eyes !== 'angry') eyes = 'blink';
  if (a.doing === 'sleep') eyes = 'blink';
  a.eyes = eyes;
}
