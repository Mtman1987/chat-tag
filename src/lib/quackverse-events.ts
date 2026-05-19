import type { QuackverseSavedState } from '@/lib/quackverse-state';

type QuackverseStateListener = (state: QuackverseSavedState) => void;

const globalKey = '__quackverseStateListeners';
type QuackverseGlobal = typeof globalThis & {
  [globalKey]?: Set<QuackverseStateListener>;
};

function listeners() {
  const store = globalThis as QuackverseGlobal;
  if (!store[globalKey]) {
    store[globalKey] = new Set<QuackverseStateListener>();
  }
  return store[globalKey];
}

export function subscribeToQuackverseState(listener: QuackverseStateListener) {
  const stateListeners = listeners();
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function publishQuackverseState(state: QuackverseSavedState) {
  listeners().forEach((listener) => listener(state));
}
