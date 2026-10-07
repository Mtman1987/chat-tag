import { randomUUID } from 'node:crypto';
import { getMosaicChannelState, MOSAIC_COLORS, MOSAIC_PALETTES, MOSAIC_WIDTH, MOSAIC_HEIGHT, normalizeMosaicTheme, type NebulaMosaicArtwork, type MosaicColorCode, type MosaicPaletteId } from '@/lib/nebula-mosaic';
import { setChannelGameRunning } from '@/lib/game-hub-state';

export function findMosaicArtwork(state: any, channel: string, id?: string | null): NebulaMosaicArtwork | undefined {
  const mosaic = state.gameSettings?.default?.gameHub?.channels?.[channel]?.mosaic;
  return [mosaic?.current, ...(mosaic?.saves || [])].find(art => art && (!id || art.id === id));
}
export function mosaicTemplate(art: NebulaMosaicArtwork) {
  return { format: 'nebula-mosaic', version: 1, width: MOSAIC_WIDTH, height: MOSAIC_HEIGHT,
    theme: art.theme, paletteId: art.paletteId || 'classic', target: [...art.target] };
}
export function validateMosaicTemplate(value: any) {
  if (value?.format !== 'nebula-mosaic' || value.version !== 1 || value.width !== MOSAIC_WIDTH || value.height !== MOSAIC_HEIGHT
    || !Array.isArray(value.target) || value.target.length !== MOSAIC_WIDTH * MOSAIC_HEIGHT
    || !value.target.every((code: unknown) => typeof code === 'string' && Object.hasOwn(MOSAIC_COLORS, code))
    || !Object.hasOwn(MOSAIC_PALETTES, value.paletteId)) throw new Error('Choose a valid 40 × 50 Nebula Mosaic project file.');
  const theme = normalizeMosaicTheme(value.theme);
  if (!theme) throw new Error('A painting title is required.');
  return { theme, paletteId: value.paletteId as MosaicPaletteId, target: [...value.target] as MosaicColorCode[] };
}
export function sharedMosaicProjects(state: any) {
  return Object.entries(state.gameSettings?.default?.gameHub?.channels || {}).flatMap(([channel, settings]: [string, any]) =>
    (settings.mosaic?.sharedProjects || []).map((project: any) => ({ ...project, channel })));
}
export function publishMosaic(state: any, channel: string, id: string, publish: boolean) {
  const mosaic = getMosaicChannelState(state, channel) as any;
  mosaic.sharedProjects ||= [];
  const existing = mosaic.sharedProjects.find((item: any) => item.artworkId === id);
  if (!publish) { mosaic.sharedProjects = mosaic.sharedProjects.filter((item: any) => item.artworkId !== id); return null; }
  const art = findMosaicArtwork(state, channel, id);
  if (!art) throw new Error('That saved painting was not found.');
  const project = { id: existing?.id || randomUUID(), artworkId: id, template: mosaicTemplate(art), publishedAt: new Date().toISOString() };
  mosaic.sharedProjects = [project, ...mosaic.sharedProjects.filter((item: any) => item.artworkId !== id)].slice(0, 20);
  return project;
}
export function startMosaicProject(state: any, channel: string, templateValue: unknown, replace = false) {
  const template = validateMosaicTemplate(templateValue);
  const mosaic = getMosaicChannelState(state, channel);
  if (mosaic.current?.status === 'active' && !replace) throw new Error('Your painting is still active. Save it and switch to start this one.');
  if (mosaic.current) {
    const previous = structuredClone(mosaic.current);
    if (previous.status === 'active') previous.status = 'suspended';
    mosaic.saves = [previous, ...mosaic.saves.filter(art => art.id !== previous.id)].slice(0, 20);
  }
  // Cancel an in-flight generator before it can overwrite the selected template.
  for (const request of mosaic.queue) if (request.status === 'generating') request.status = 'cancelled';
  const now = new Date().toISOString();
  const art: NebulaMosaicArtwork = { id: `mosaic:${channel}:${randomUUID()}`, ...template, requestedBy: channel,
    requestedByPlayerId: '', createdAt: now, updatedAt: now, lastInteractionAt: now, status: 'active',
    painted: Array(2000).fill(''), paintedBy: Array(2000).fill(''), activeBoard: 1, viewMode: 'board', awardedMilestones: [], activeIdleMs: 0, lastHeartbeatAt: now };
  mosaic.current = art;
  setChannelGameRunning(state, channel, 'pixelbattle', true);
  return art;
}
export function resumeMosaicProject(state: any, channel: string, id: string, replace = false) {
  const saved = findMosaicArtwork(state, channel, id);
  if (!saved || !['active', 'suspended'].includes(saved.status)) throw new Error('Choose an unfinished saved painting.');
  const mosaic = getMosaicChannelState(state, channel);
  if (mosaic.current?.id !== id && mosaic.current?.status === 'active' && !replace) throw new Error('Save your active painting and switch first.');
  if (mosaic.current && mosaic.current.id !== id) {
    const previous = structuredClone(mosaic.current);
    if (previous.status === 'active') previous.status = 'suspended';
    mosaic.saves = [previous, ...mosaic.saves.filter(art => art.id !== previous.id)].slice(0, 20);
  }
  const resumed = structuredClone(saved);
  resumed.status = 'active'; resumed.activeIdleMs = 0;
  resumed.lastHeartbeatAt = resumed.lastInteractionAt = resumed.updatedAt = new Date().toISOString();
  for (const request of mosaic.queue) if (request.status === 'generating') request.status = 'cancelled';
  mosaic.current = resumed;
  setChannelGameRunning(state, channel, 'pixelbattle', true);
  return { id: resumed.id };
}
export function mosaicTemplateSvg(templateValue: unknown) {
  const template = validateMosaicTemplate(templateValue);
  const palette = MOSAIC_PALETTES[template.paletteId];
  const cells = template.target.map((code, index) => `<rect x="${index % 40 * 20}" y="${Math.floor(index / 40) * 20}" width="20" height="20" fill="${palette[code]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">${cells}</svg>`;
}
