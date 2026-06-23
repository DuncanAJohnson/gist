import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import Home from './pages/Home'
import Library from './pages/Library'
import TwoBoxesSimulation from './simulations/TwoBoxesSimulation'
import TossBallSimulation from './simulations/TossBallSimulation'
import BallIntoCupDropSimulation from './simulations/BallIntoCupDropSimulation'
import BallIntoCupArcSimulation from './simulations/BallIntoCupArcSimulation'
import ProjectileLaunchPolarSimulation from './simulations/ProjectileLaunchPolarSimulation'
import DynamicSimulation from './pages/DynamicSimulation'
import { CreateSimulationProvider } from './contexts/CreateSimulationContext'
import { LanguageProvider } from './contexts/LanguageContext'

// Docs pages are lazy-loaded — mermaid is a chunky dep we don't want in the main bundle.
const DocsIndex = lazy(() => import('./pages/docs/DocsIndex'))
const AppOverview = lazy(() => import('./pages/docs/AppOverview'))
const PhysicsStack = lazy(() => import('./pages/docs/PhysicsStack'))
const RuntimeLoop = lazy(() => import('./pages/docs/RuntimeLoop'))
const LLMPipeline = lazy(() => import('./pages/docs/LLMPipeline'))
const RefactorRoadmap = lazy(() => import('./pages/docs/RefactorRoadmap'))
const VectorArrows = lazy(() => import('./pages/docs/VectorArrows'))
const RecordingsAndCameras = lazy(() => import('./pages/docs/RecordingsAndCameras'))
const DesignPhilosophy = lazy(() => import('./pages/docs/DesignPhilosophy'))

function DocsFallback() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 text-center text-gray-500">
      Loading docs…
    </div>
  )
}

function AppContent() {
  return (
    <>
      <Navigation />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/simulation/two-boxes" element={<TwoBoxesSimulation />} />
        <Route path="/simulation/toss-ball" element={<TossBallSimulation />} />
        <Route path="/simulation/ball-into-cup-drop" element={<BallIntoCupDropSimulation />} />
        <Route path="/simulation/ball-into-cup-arc" element={<BallIntoCupArcSimulation />} />
        <Route path="/simulation/projectile-launch-polar" element={<ProjectileLaunchPolarSimulation />} />
        <Route path="/simulation/dynamic" element={<DynamicSimulation />} />
        <Route path="/simulation/:id" element={<DynamicSimulation />} />
        <Route
          path="/docs"
          element={<Suspense fallback={<DocsFallback />}><DocsIndex /></Suspense>}
        />
        <Route
          path="/docs/app-overview"
          element={<Suspense fallback={<DocsFallback />}><AppOverview /></Suspense>}
        />
        <Route
          path="/docs/physics-stack"
          element={<Suspense fallback={<DocsFallback />}><PhysicsStack /></Suspense>}
        />
        <Route
          path="/docs/runtime-loop"
          element={<Suspense fallback={<DocsFallback />}><RuntimeLoop /></Suspense>}
        />
        <Route
          path="/docs/llm-pipeline"
          element={<Suspense fallback={<DocsFallback />}><LLMPipeline /></Suspense>}
        />
        <Route
          path="/docs/refactor-roadmap"
          element={<Suspense fallback={<DocsFallback />}><RefactorRoadmap /></Suspense>}
        />
        <Route
          path="/docs/vector-arrows"
          element={<Suspense fallback={<DocsFallback />}><VectorArrows /></Suspense>}
        />
        <Route
          path="/docs/recordings-and-cameras"
          element={<Suspense fallback={<DocsFallback />}><RecordingsAndCameras /></Suspense>}
        />
        <Route
          path="/docs/design-philosophy"
          element={<Suspense fallback={<DocsFallback />}><DesignPhilosophy /></Suspense>}
        />
      </Routes>
    </>
  )
}

function App() {
  return (
    <Router>
      <LanguageProvider>
        <CreateSimulationProvider>
          <div className="min-h-screen bg-gray-100">
            <AppContent />
          </div>
        </CreateSimulationProvider>
      </LanguageProvider>
    </Router>
  )
}

export default App

