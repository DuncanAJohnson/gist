import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import TwoBoxesSimulation from './simulations/TwoBoxesSimulation'
import TossBallSimulation from './simulations/TossBallSimulation'
import CreateSimulation from './pages/CreateSimulation'
import DynamicSimulation from './pages/DynamicSimulation'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/simulation/two-boxes" element={<TwoBoxesSimulation />} />
          <Route path="/simulation/toss-ball" element={<TossBallSimulation />} />
          <Route path="/create-simulation" element={<CreateSimulation />} />
          <Route path="/simulation/dynamic" element={<DynamicSimulation />} />
          <Route path="/simulation/:id" element={<DynamicSimulation />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App

