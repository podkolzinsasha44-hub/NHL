import { createContext, useContext } from 'react';

/**
 * Every opened screen stays mounted (hidden in an <Activity>) so its local state — segments,
 * filters, inputs, scroll — survives tab switches. A layer knows whether it is the one on screen
 * and how deep it sits in its tab's stack.
 */
export interface LayerInfo {
  active: boolean;
  depth: number;
}

export const LayerCtx = createContext<LayerInfo>({ active: true, depth: 0 });

export const useLayer = () => useContext(LayerCtx);
