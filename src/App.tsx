import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import TwoBoxesSimulation from './simulations/TwoBoxesSimulation'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/simulation/two-boxes" element={<TwoBoxesSimulation />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App

