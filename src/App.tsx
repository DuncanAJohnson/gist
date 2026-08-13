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
import ProjectileVelocityComponentsSimulation from './simulations/ProjectileVelocityComponentsSimulation'
import FreefallWithDragSimulation from './simulations/FreefallWithDragSimulation'
import BowlingBallAndFeatherSimulation from './simulations/BowlingBallAndFeatherSimulation'
import MonkeyAndAppleSimulation from './simulations/MonkeyAndAppleSimulation'
import RampSlideSimulation from './simulations/RampSlideSimulation'
import AppliedForce1DSimulation from './simulations/AppliedForce1DSimulation'
import AppliedForce2DSimulation from './simulations/AppliedForce2DSimulation'
import RampEnergySimulation from './simulations/RampEnergySimulation'
import PolarAuthoredVelocitySimulation from './simulations/PolarAuthoredVelocitySimulation'
import CupCatchSimulation from './simulations/CupCatchSimulation'
import BoxCatchSimulation from './simulations/BoxCatchSimulation'
import WagonStopSimulation from './simulations/WagonStopSimulation'
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
const AuthoringJson = lazy(() => import('./pages/docs/AuthoringJson'))

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
        <Route path="/simulation/projectile-velocity-components" element={<ProjectileVelocityComponentsSimulation />} />
        <Route path="/simulation/freefall-with-drag" element={<FreefallWithDragSimulation />} />
        <Route path="/simulation/bowling-ball-and-feather" element={<BowlingBallAndFeatherSimulation />} />
        <Route path="/simulation/monkey-and-apple" element={<MonkeyAndAppleSimulation />} />
        <Route path="/simulation/ramp-slide" element={<RampSlideSimulation />} />
        <Route path="/simulation/applied-force-1d" element={<AppliedForce1DSimulation />} />
        <Route path="/simulation/applied-force-2d" element={<AppliedForce2DSimulation />} />
        <Route path="/simulation/ramp-energy" element={<RampEnergySimulation />} />
        <Route path="/simulation/polar-authored-velocity" element={<PolarAuthoredVelocitySimulation />} />
        <Route path="/simulation/cup-catch" element={<CupCatchSimulation />} />
        <Route path="/simulation/box-catch" element={<BoxCatchSimulation />} />
        <Route path="/simulation/wagon-stop" element={<WagonStopSimulation />} />
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
        <Route
          path="/docs/authoring-json"
          element={<Suspense fallback={<DocsFallback />}><AuthoringJson /></Suspense>}
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

