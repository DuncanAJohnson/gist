import React, { createContext, useContext } from 'react';

const PhysicsContext = createContext(null);

export const PhysicsProvider = ({ engine, children }) => {
  return (
    <PhysicsContext.Provider value={engine}>
      {children}
    </PhysicsContext.Provider>
  );
};

export const usePhysics = () => {
  const engine = useContext(PhysicsContext);
  if (!engine) {
    throw new Error('usePhysics must be used within a PhysicsProvider');
  }
  return engine;
};

export default PhysicsContext;

