import { createContext, useContext, ReactNode } from 'react';
import type { PhysicsAdapter } from '../physics/types';

const PhysicsContext = createContext<PhysicsAdapter | null>(null);

interface PhysicsProviderProps {
  adapter: PhysicsAdapter;
  children: ReactNode;
}

export const PhysicsProvider = ({ adapter, children }: PhysicsProviderProps) => {
  return (
    <PhysicsContext.Provider value={adapter}>
      {children}
    </PhysicsContext.Provider>
  );
};

export const usePhysics = (): PhysicsAdapter => {
  const adapter = useContext(PhysicsContext);
  if (!adapter) {
    throw new Error('usePhysics must be used within a PhysicsProvider');
  }
  return adapter;
};

export default PhysicsContext;
