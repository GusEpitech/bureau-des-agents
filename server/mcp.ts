// Les connecteurs MCP de Claude Code : la liste vérifiée (« claude mcp list »), pour la fenêtre de la machine.
// Rien de secret ne sort d'ici : d'un serveur distant on ne garde que le site, d'une commande locale que son
// programme (ses arguments peuvent contenir une clé d'API).
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { McpServer } from '../shared/protocol.ts';

/** Ce qu'on peut montrer d'une cible MCP : le site d'une URL, ou le programme d'une commande. */
function where(target: string): string {
  const t = target.trim();
  try {
    const u = new URL(t);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname.replace(/^www\./, '');
  } catch { /* pas une URL : une commande */ }
  const bin = t.split(/\s+/)[0] ?? '';
  return bin ? `commande locale (${path.basename(bin)})` : 'commande locale';
}

function statusOf(raw: string): McpServer['status'] {
  const s = raw.toLowerCase();
  if (s.includes('connected') && !s.includes('not')) return 'ok';
  if (s.includes('auth')) return 'auth';
  if (s.includes('pending')) return 'pending';
  if (s.includes('disabled')) return 'disabled';
  return 'failed';
}

/** « nom: cible - ✔ Connected » → un serveur. */
export function parseMcpList(out: string): McpServer[] {
  const list: McpServer[] = [];
  for (const line of out.split('\n')) {
    const m = /^(.+?): (.+) - (.+)$/.exec(line.trim());
    if (!m) continue;
    const [, name, target, status] = m;
    const cloud = name.startsWith('claude.ai ');
    list.push({
      name: cloud ? name.slice('claude.ai '.length) : name,
      source: cloud ? 'claude.ai' : 'local',
      status: statusOf(status),
      label: status.replace(/^[^\p{L}]+/u, '').trim(),
      where: where(target),
    });
  }
  return list;
}

/** Lance « claude mcp list » dans un dossier (les MCP d'un projet dépendent de son .mcp.json). */
export function mcpList(bin: string, cwd: string): Promise<McpServer[]> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['mcp', 'list'], { cwd, timeout: 60_000, encoding: 'utf8', env: { ...process.env, BUREAU_DES_AGENTS: '1' } }, (err, stdout, stderr) => {
      const list = parseMcpList(stdout);
      if (list.length || !err) { resolve(list); return; }
      reject(new Error(err.killed ? 'La vérification des MCP a pris trop de temps.' : (stderr || err.message).split('\n').filter(Boolean).pop() ?? 'La vérification des MCP a échoué.'));
    });
  });
}
