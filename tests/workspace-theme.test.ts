import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceThemeTokensV1 } from '@spmt/sdk';
import { applyWorkspaceThemeTokens, clearWorkspaceThemeTokens } from '../src/lib/workspace-theme';

function fixtureRoot() {
  const values = new Map<string, string>();
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (key: string, value: string) => values.set(key, value),
      removeProperty: (key: string) => values.delete(key),
    },
  } as unknown as HTMLElement;
  return { root, values };
}

const tokens = {
  themeId: 'nebula-purple',
  background: '#000000',
  surface: '#112233',
  text: '#ffffff',
  accent: '#ff00ff',
  radius: 'lg',
  density: 'compact',
  motion: { enabled: true },
  appearance: {
    glowIntensity: 80, starDensity: 60, glassOpacity: 70, blurStrength: 12,
    nebulaIntensity: 50, parallaxDepth: 40, borderStrength: 30, chatTransparency: 20,
    sidebarCollapsed: false, sidebarStyle: 'glass', sidebarPosition: 'left',
    topbarStyle: 'glass', tabStyle: 'pill', tabPosition: 'top',
    showAvatars: true, smoothTransitions: true, pushToTalk: false,
    animation: { speed: 100, particles: true, shootingStars: true },
  },
  dockSlots: [{ id: 'chat' }, { id: 'media' }],
  ttsSubscriptions: ['alerts'],
  overlayWorkspace: { enabled: true, widgets: [{ id: 'clock' }], workflows: ['scene.start'] },
} as unknown as WorkspaceThemeTokensV1;

test('applies all shared colors, layout attributes, background artwork, and overlay metadata', () => {
  const { root, values } = fixtureRoot();
  applyWorkspaceThemeTokens(root, tokens);
  assert.equal(root.dataset.appTheme, 'workspace');
  assert.equal(values.get('--background'), '0 0% 0%');
  assert.equal(values.get('--radius'), '26px');
  assert.equal(values.get('--workspace-background-image'), 'url("https://spacemountain.live/assets/theme-nebula-purple-background.webp")');
  assert.equal(values.get('--workspace-shooting-star-duration'), '12s');
  assert.equal(root.dataset.workspaceTabStyle, 'pill');
  assert.equal(root.dataset.workspaceOverlayEnabled, 'true');
  assert.equal(root.dataset.workspaceDockSlots, encodeURIComponent(JSON.stringify(tokens.dockSlots)));
});

test('clears shared colors and workspace metadata before a local preset', () => {
  const { root, values } = fixtureRoot();
  applyWorkspaceThemeTokens(root, tokens);
  clearWorkspaceThemeTokens(root);
  assert.equal(values.has('--background'), false);
  assert.equal(values.has('--workspace-background-image'), false);
  assert.equal(values.has('--workspace-glow-intensity'), false);
  assert.equal(root.dataset.workspaceTheme, undefined);
  assert.equal(root.dataset.workspaceOverlayWorkflows, undefined);
});
