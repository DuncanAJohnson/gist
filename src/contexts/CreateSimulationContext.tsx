import { createContext, useContext, useState, ReactNode } from 'react';

interface CreateSimulationContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const CreateSimulationContext = createContext<CreateSimulationContextType | undefined>(undefined);

export function CreateSimulationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  return (
    <CreateSimulationContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </CreateSimulationContext.Provider>
  );
}

export function useCreateSimulation() {
  const context = useContext(CreateSimulationContext);
  if (context === undefined) {
    throw new Error('useCreateSimulation must be used within a CreateSimulationProvider');
  }
  return context;
}

