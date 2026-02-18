import React, { createContext, useContext } from 'react';
import type { PlatformBridge } from './types';

const BridgeContext = createContext<PlatformBridge>(null!);

export const useBridge = () => useContext(BridgeContext);

export function BridgeProvider({
  bridge,
  children,
}: {
  bridge: PlatformBridge;
  children: React.ReactNode;
}) {
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}
