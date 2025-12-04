import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import TwoBoxesSimulation from './simulations/TwoBoxesSimulation'
import TossBallSimulation from './simulations/TossBallSimulation'
import DynamicSimulation from './pages/DynamicSimulation'
import { CreateSimulationProvider } from './contexts/CreateSimulationContext'

function AppContent() {
  return (
    <>
      <Navigation />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/simulation/two-boxes" element={<TwoBoxesSimulation />} />
        <Route path="/simulation/toss-ball" element={<TossBallSimulation />} />
        <Route path="/simulation/dynamic" element={<DynamicSimulation />} />
        <Route path="/simulation/:id" element={<DynamicSimulation />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <Router>
      <CreateSimulationProvider>
        <div className="min-h-screen bg-gray-100">
          <AppContent />
        </div>
      </CreateSimulationProvider>
    </Router>
  )
}

export default App

