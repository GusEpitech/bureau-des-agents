// Les types internes du bureau : l'état gardé sur disque, la séance Claude Code en cours, la mission ouverte.
import type { FSWatcher } from 'node:fs';
import type { Logged, MissionInfo, Quota, Settings, TurnUsage } from '../shared/protocol.ts';
import type { ClaudeProcess, Normalizer } from './claude.ts';

export interface State { missions: MissionInfo[]; settings: Settings; /** le dernier quota mesuré (gardé d'un lancement à l'autre) */ quota?: Quota | null; /** la mission ouverte (rouverte au redémarrage du bureau) */ currentId?: string }

export interface Live {
  proc: ClaudeProcess;
  norm: Normalizer;
  stopping: boolean;
  /** le dernier message envoyé (pour le renvoyer si la reprise de séance échoue) */
  lastText: string;
  resumed: boolean;
}

export interface Current {
  mission: MissionInfo;
  log: Logged[];
  live: Live | null;
  /** les prénoms déjà donnés dans cette mission */
  names: Set<string>;
  watcher: FSWatcher | null;
  fileTimers: Map<string, NodeJS.Timeout>;
  idleTimer: NodeJS.Timeout | null;
  /** depuis quand l'équipe travaille (null = au repos) */
  busySince: number | null;
  stopAsked: boolean;
  lastChefText: string;
  /** ce que le tour en cours a consommé (cumulé si Max reprend la main après l'équipe) */
  usage?: TurnUsage;
}
