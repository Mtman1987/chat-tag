import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('ChatTag has exactly one canonical Personal renderer host', () => {
  const layout = read('src/app/layout.tsx');
  const personal = read('src/components/personal-overlay-host.tsx');
  const worktray = read('src/components/spmt-workspace-host.tsx');

  assert.equal((layout.match(/<PersonalOverlayHost \/>/g) || []).length, 1);
  assert.match(personal, /data-canonical-personal-overlay="true"/);
  assert.match(personal, /src=\{url\}/);
  assert.match(personal, /PERSONAL_VISIBILITY_EVENT/);
  assert.doesNotMatch(worktray, /widgets\.map\(/);
  assert.doesNotMatch(worktray, /data-canonical-personal-overlay/);
});

test('Worktray controls Personal visibility without controlling footer visibility', () => {
  const worktray = read('src/components/spmt-workspace-host.tsx');
  assert.match(worktray, /Personal overlay \{personalOverlayVisible \? 'On' : 'Off'\}/);
  assert.match(worktray, /window\.dispatchEvent\(new CustomEvent\(PERSONAL_VISIBILITY_EVENT/);
  assert.match(worktray, /event\.altKey && event\.shiftKey && event\.key\.toLowerCase\(\) === 'f'/);
  assert.match(worktray, /if \(hiddenRoute \|\| embedded\) return null/);
  assert.match(worktray, /if \(!footerVisible\) return footerToggleTarget/);
  assert.match(worktray, /data-workspace-footer="true"/);
  assert.match(worktray, /Copy Public URL/);
  assert.match(worktray, /Copy Personal URL/);
});

test('SPMT bridge returns signed Personal launch URL and clean canonical copy URLs', () => {
  const route = read('src/app/api/spmt/workspace-theme/route.ts');
  assert.match(route, /api\/personal-overlay-launch/);
  assert.match(route, /personalOverlayUrl: personal\.ok/);
  assert.match(route, /tenantOutputs: tenant \? \{/);
  assert.match(route, /public: `\$\{SPMT_BASE_URL\}\/tenant\/\$\{encodeURIComponent\(tenant\)\}\/public`/);
  assert.match(route, /personal: personalCanonical/);
  assert.doesNotMatch(route, /access_token=|spmt_token=/i);
});

test('Chat Tag header Workspace toggle owns footer visibility instead of redirecting', () => {
  const worktray = read('src/components/spmt-workspace-host.tsx');
  assert.match(worktray, /spmt:workspace-toggle/);
  assert.match(worktray, /event\.preventDefault\(\)/);
  assert.match(worktray, /setFooterVisibility\(!footerVisible\)/);
  assert.match(worktray, /data-spmt-open-workspace/);
  assert.match(worktray, /data-spmt-workspace-controls-slot/);
  assert.match(worktray, /\[footerVisible, setFooterVisible\] = React.useState\(false\)/);
  assert.doesNotMatch(worktray, /FOOTER_VISIBILITY_KEY/);
  assert.match(worktray, /setOpen\(next\)/);
  assert.match(worktray, /Hide workspace footer/);
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /workspace-controller\.js/);
});

