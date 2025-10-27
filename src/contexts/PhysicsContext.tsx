import { createContext, useContext, ReactNode } from 'react';
import Matter from 'matter-js';

const PhysicsContext = createContext<Matter.Engine | null>(null);

interface PhysicsProviderProps {
  engine: Matter.Engine;
  children: ReactNode;
}

export const PhysicsProvider = ({ engine, children }: PhysicsProviderProps) => {
  return (
    <PhysicsContext.Provider value={engine}>
      {children}
    </PhysicsContext.Provider>
  );
};

export const usePhysics = (): Matter.Engine => {
  const engine = useContext(PhysicsContext);
  if (!engine) {
    throw new Error('usePhysics must be used within a PhysicsProvider');
  }
  return engine;
};

export default PhysicsContext;

