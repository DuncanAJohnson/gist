import { createContext, useContext, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateSimulation from '../components/CreateSimulation';
import { createSimulation } from '../lib/simulationService';

interface CreateSimulationContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const CreateSimulationContext = createContext<CreateSimulationContextType | undefined>(undefined);

export function CreateSimulationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  const handleJSONExtracted = async (json: any) => {
    try {
      const simulationId = await createSimulation(json, true, null);
      closeModal();
      navigate(`/simulation/${simulationId}`);
    } catch (error) {
      console.error('Failed to save simulation:', error);
      alert('Failed to save simulation. Please try again.');
    }
  };

  return (
    <CreateSimulationContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
      <CreateSimulation isOpen={isOpen} onClose={closeModal} onJSONExtracted={handleJSONExtracted} />
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

