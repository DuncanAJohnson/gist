import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
console.log('starting...')

// Tab 1: Momentum Conservation Simulation (zero gravity, no friction)
function MomentumSimulation() {
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const runnerRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true);
  const [stats, setStats] = useState({
    box1: { velocity: 0, momentum: 0 },
    box2: { velocity: 0, momentum: 0 },
    totalMomentum: 0,
    initialMomentum: 0
  });

  const [params, setParams] = useState({
    mass1: 1,
    mass2: 2,
    vel1: 5,
    vel2: -3
  });

  useEffect(() => {
    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const Composite = Matter.Composite;
    const Body = Matter.Body;
    const Events = Matter.Events;

    // Create engine
    const engine = Engine.create({
      gravity: { x: 0, y: 0 }
    });
    engineRef.current = engine;

    // Create renderer
    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 400,
        wireframes: false,
        background: '#f8f9fa'
      }
    });

    // Create walls
    const wallOptions = {
      isStatic: true,
      friction: 0,
      frictionStatic: 0,
      render: { fillStyle: '#333' }
    };

    const walls = [
      Bodies.rectangle(400, 10, 800, 20, wallOptions),
      Bodies.rectangle(400, 390, 800, 20, wallOptions),
      Bodies.rectangle(10, 200, 20, 400, wallOptions),
      Bodies.rectangle(790, 200, 20, 400, wallOptions)
    ];

    // Calculate dimensions from mass using density (2:1 aspect ratio rectangles)
    const DENSITY = 0.001;
    const MIN_HEIGHT = 20;
    const MAX_HEIGHT = 150;

    // For 2:1 aspect ratio: width = 2*height, area = 2*height^2
    // mass = density * area, so height = sqrt(mass / (2 * density))
    const calculateDimensions = (mass) => {
      const height = Math.sqrt(mass / (2 * DENSITY));
      const constrainedHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
      return {
        width: 2 * constrainedHeight,
        height: constrainedHeight
      };
    };

    const box1Dims = calculateDimensions(params.mass1);
    const box2Dims = calculateDimensions(params.mass2);

    // Create boxes
    const box1 = Bodies.rectangle(200, 200, box1Dims.width, box1Dims.height, {
      density: DENSITY,
      restitution: 1.0,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      inertia: Infinity,
      render: {
        fillStyle: '#2196F3',
        strokeStyle: '#1976D2',
        lineWidth: 3
      }
    });

    const box2 = Bodies.rectangle(600, 200, box2Dims.width, box2Dims.height, {
      density: DENSITY,
      restitution: 1.0,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      inertia: Infinity,
      render: {
        fillStyle: '#f44336',
        strokeStyle: '#d32f2f',
        lineWidth: 3
      }
    });

    Body.setVelocity(box1, { x: params.vel1, y: 0 });
    Body.setVelocity(box2, { x: params.vel2, y: 0 });

    // Add all to world
    Composite.add(engine.world, [...walls, box1, box2]);

    // Calculate initial momentum using actual masses (from density × area)
    const initialMomentum = (box1.mass * params.vel1) + (box2.mass * params.vel2);

    // Update stats on each frame
    Events.on(engine, 'afterUpdate', function() {
      const m1 = box1.mass;
      const m2 = box2.mass;
      const v1 = box1.velocity.x;
      const v2 = box2.velocity.x;
      const p1 = m1 * v1;
      const p2 = m2 * v2;
      const total = p1 + p2;

      setStats({
        box1: { mass: m1, velocity: v1, momentum: p1 },
        box2: { mass: m2, velocity: v2, momentum: p2 },
        totalMomentum: total,
        initialMomentum: initialMomentum
      });
    });

    // Create runner and renderer
    const runner = Runner.create();
    runnerRef.current = runner;

    // Only start runner if not paused
    if (!isPaused) {
      Runner.run(runner, engine);
    }

    Render.run(render);

    // Cleanup
    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [params]);

  const handleTogglePause = () => {
    if (isPaused) {
      // Resume
      Matter.Runner.run(runnerRef.current, engineRef.current);
    } else {
      // Pause
      Matter.Runner.stop(runnerRef.current);
    }
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setParams({ ...params });
    setIsPaused(true)
  };

  const momentumError = Math.abs(stats.totalMomentum - stats.initialMomentum);
  const isConserved = momentumError < 0.01;

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>
        Conservation of Momentum - Matter.js
      </h2>
    
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '20px',
        marginBottom: '20px',
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ border: '2px solid #2196F3', borderRadius: '5px', padding: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2196F3' }}>Box 1 (Blue)</h3>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Mass: 
            <input 
              type="number" 
              value={params.mass1} 
              onChange={(e) => setParams({...params, mass1: parseFloat(e.target.value)})}
              step="0.1"
              min="0.1"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            kg
          </label>
          <label style={{ display: 'block' }}>
            Velocity: 
            <input 
              type="number" 
              value={params.vel1} 
              onChange={(e) => setParams({...params, vel1: parseFloat(e.target.value)})}
              step="0.5"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            m/s
          </label>
        </div>

        <div style={{ border: '2px solid #f44336', borderRadius: '5px', padding: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#f44336' }}>Box 2 (Red)</h3>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Mass: 
            <input 
              type="number" 
              value={params.mass2} 
              onChange={(e) => setParams({...params, mass2: parseFloat(e.target.value)})}
              step="0.1"
              min="0.1"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            kg
          </label>
          <label style={{ display: 'block' }}>
            Velocity: 
            <input 
              type="number" 
              value={params.vel2} 
              onChange={(e) => setParams({...params, vel2: parseFloat(e.target.value)})}
              step="0.5"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            m/s
          </label>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button 
          onClick={handleTogglePause}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: isPaused ? '#FF9800' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>

        <button 
          onClick={handleReset}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset Simulation
        </button>
      </div>

      <div ref={sceneRef} style={{ 
        display: 'flex', 
        justifyContent: 'center',
        marginBottom: '20px'
      }} />

      <div style={{ 
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#2196F3' }}>Box 1:</strong> v = {stats.box1.velocity.toFixed(2)} m/s, 
          p = {stats.box1.momentum.toFixed(2)} kg·m/s
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#f44336' }}>Box 2:</strong> v = {stats.box2.velocity.toFixed(2)} m/s, 
          p = {stats.box2.momentum.toFixed(2)} kg·m/s
        </div>
        <div style={{ 
          marginTop: '15px', 
          paddingTop: '15px', 
          borderTop: '2px solid #ddd',
          fontSize: '16px'
        }}>
          <div><strong>Initial Total Momentum:</strong> {stats.initialMomentum.toFixed(2)} kg·m/s</div>
          <div><strong>Current Total Momentum:</strong> {stats.totalMomentum.toFixed(2)} kg·m/s</div>
          <div style={{ 
            marginTop: '10px',
            padding: '10px',
            background: isConserved ? '#c8e6c9' : '#ffcdd2',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}>
            {isConserved ? '✓ Momentum Conserved!' : `⚠ Error: ${momentumError.toFixed(4)} kg·m/s`}
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab 2: Friction Testing Simulation (with gravity, pucks on table)
function FrictionSimulation() {
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const runnerRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true);
  const [stats, setStats] = useState({
    puck1: { velocity: 0, position: 0 },
    puck2: { velocity: 0, position: 0 }
  });

  const [params, setParams] = useState({
    vel1: 5,
    vel2: -3,
    friction: 0.05
  });

  useEffect(() => {
    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const Composite = Matter.Composite;
    const Body = Matter.Body;
    const Events = Matter.Events;

    // Create engine with gravity
    const engine = Engine.create({
      gravity: { x: 0, y: 1 }
    });
    engineRef.current = engine;

    // Create renderer
    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 400,
        wireframes: false,
        background: '#f8f9fa'
      }
    });

    // Create table surface (large rectangle)
    const table = Bodies.rectangle(400, 350, 700, 40, {
      isStatic: true,
      restitution: 1,
      friction: params.friction,
      render: {
        fillStyle: '#8B4513',
        strokeStyle: '#654321',
        lineWidth: 2
      }
    });

    // Create walls to keep pucks on table
    const wallOptions = {
      isStatic: true,
      restitution: 0.99,
      friction: 0,
      render: { fillStyle: '#333' }
    };

    const walls = [
      Bodies.rectangle(50, 300, 20, 200, wallOptions),   // left wall
      Bodies.rectangle(750, 300, 20, 200, wallOptions)   // right wall
    ];

    // Create two pucks (circles)
    const puck1 = Bodies.rectangle (200, 315, 30,30, {
      density: 0.001,
      restitution: 0.99,
      inertia: 1e10,
      friction: params.friction,
      frictionStatic: 0,
      frictionAir: 0,
      render: {
        fillStyle: '#2196F3',
        strokeStyle: '#1976D2',
        lineWidth: 3
      }
    });

    const puck2 = Bodies.rectangle (600, 315, 30, 30, {
      density: 0.001,
      restitution: .99,
      inertia: 1e10,
      friction: params.friction,
      frictionStatic: 100,
      frictionAir: 0,
      render: {
        fillStyle: '#f44336',
        strokeStyle: '#d32f2f',
        lineWidth: 3
      }
    });

    Body.setVelocity(puck1, { x: params.vel1, y: 0 });
    Body.setVelocity(puck2, { x: params.vel2, y: 0 });

    // Add all to world
    Composite.add(engine.world, [table, ...walls, puck1, puck2]);

    // Update stats on each frame
    Events.on(engine, 'afterUpdate', function() {
      const v1 = puck1.velocity.x;
      const v2 = puck2.velocity.x;
      const pos1 = puck1.position.y;
      const pos2 = puck2.position.y;

      setStats({
        puck1: { velocity: v1, position: pos1 },
        puck2: { velocity: v2, position: pos2 }
      });
    });

    // Create runner
    const runner = Runner.create();
    runnerRef.current = runner;

    // Only start runner if not paused
    if (!isPaused) {
      Runner.run(runner, engine);
    }

    Render.run(render);

    // Cleanup
    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [params]);

  const handleTogglePause = () => {
    if (isPaused) {
      Matter.Runner.run(runnerRef.current, engineRef.current);
    } else {
      Matter.Runner.stop(runnerRef.current);
    }
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    setParams({ ...params });
    setIsPaused(true);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>
        Friction Testing - Pucks on Table
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginBottom: '20px',
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ border: '2px solid #2196F3', borderRadius: '5px', padding: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2196F3' }}>Puck 1 (Blue)</h3>
          <label style={{ display: 'block' }}>
            Velocity:
            <input
              type="number"
              value={params.vel1}
              onChange={(e) => setParams({...params, vel1: parseFloat(e.target.value)})}
              step="0.5"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            m/s
          </label>
        </div>

        <div style={{ border: '2px solid #f44336', borderRadius: '5px', padding: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#f44336' }}>Puck 2 (Red)</h3>
          <label style={{ display: 'block' }}>
            Velocity:
            <input
              type="number"
              value={params.vel2}
              onChange={(e) => setParams({...params, vel2: parseFloat(e.target.value)})}
              step="0.5"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            m/s
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <label style={{ display: 'block' }}>
          <strong>Friction Coefficient:</strong>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.0001"
            value={params.friction}
            onChange={(e) => setParams({...params, friction: parseFloat(e.target.value)})}
            style={{ marginLeft: '10px', width: '300px', verticalAlign: 'middle' }}
          />
          <span style={{ marginLeft: '10px' }}>{params.friction.toFixed(5)}</span>
        </label>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={handleTogglePause}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: isPaused ? '#FF9800' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>

        <button
          onClick={handleReset}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset Simulation
        </button>
      </div>

      <div ref={sceneRef} style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '20px'
      }} />

      <div style={{
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#2196F3' }}>Puck 1:</strong> v = {stats.puck1.velocity.toFixed(2)} m/s,
          y = {stats.puck1.position.toFixed(1)} px
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#f44336' }}>Puck 2:</strong> v = {stats.puck2.velocity.toFixed(2)} m/s,
          y = {stats.puck2.position.toFixed(1)} px
        </div>
      </div>
    </div>
  );
}

// Tab 3: Applied Force and Friction Simulation
function AppliedForceSimulation() {
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const runnerRef = useRef(null);
  const renderRef = useRef(null);
  const boxRef = useRef(null);
  const [isPaused, setIsPaused] = useState(true);
  const [stats, setStats] = useState({
    velocity: 0,
    position: 0,
    appliedForce: 0,
    staticFrictionForce: 0,
    kineticFrictionForce: 0,
    netForce: 0,
    normalForce: 0,
    mass: 0,
    acceleration: 0
  });

  const [params, setParams] = useState({
    appliedForce: 3.0,
    friction: 0.1,
    staticFriction: 0.15,
    forceDelay: 1000 // milliseconds before force is applied
  });

  const [forceActive, setForceActive] = useState(false);
  const forceTimerRef = useRef(null);

  useEffect(() => {
    const Engine = Matter.Engine;
    const Render = Matter.Render;
    const Runner = Matter.Runner;
    const Bodies = Matter.Bodies;
    const Composite = Matter.Composite;
    const Body = Matter.Body;
    const Events = Matter.Events;

    // Create engine with gravity
    const engine = Engine.create({
      gravity: { x: 0, y: 1 }
    });
    engineRef.current = engine;

    // Create renderer
    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 400,
        wireframes: false,
        background: '#f8f9fa'
      }
    });
    renderRef.current = render;

    // Create ground surface
    const ground = Bodies.rectangle(400, 370, 760, 40, {
      isStatic: true,
      friction: params.friction,
      render: {
        fillStyle: '#555',
        strokeStyle: '#333',
        lineWidth: 2
      }
    });

    // Create box to apply forces to
    const box = Bodies.rectangle(150, 320, 60, 60, {
      density: 0.1,
      restitution: 0.3,
      inertia: 1e10,
      friction: params.friction,
      frictionStatic: params.staticFriction,
      frictionAir: 0,
      render: {
        fillStyle: '#4CAF50',
        strokeStyle: '#2E7D32',
        lineWidth: 3
      }
    });
    boxRef.current = box;

    // Add to world
    Composite.add(engine.world, [ground, box]);

    // Apply force on each update (only if force is active)
    Events.on(engine, 'beforeUpdate', function() {
      if (boxRef.current && forceActive) {
        const box = boxRef.current;
        const mass = box.mass;
        const normalForce = mass * Math.abs(engine.gravity.y);
        const staticFrictionForce = params.staticFriction * normalForce;
        const kineticFrictionForce = params.friction * normalForce;

        // Check if box is essentially at rest (velocity very small)
        const isAtRest = Math.abs(box.velocity.x) < 0.01 && Math.abs(box.velocity.y) < 0.01;

        if (isAtRest) {
          // Box is at rest - check static friction threshold
          const appliedForceMagnitude = Math.abs(params.appliedForce);

          if (appliedForceMagnitude > staticFrictionForce) {
            // Applied force overcomes static friction - apply net force
            // Net force = applied - kinetic friction (once motion starts)
            const frictionDirection = params.appliedForce > 0 ? -1 : 1;
            const netForce = params.appliedForce + (frictionDirection * kineticFrictionForce);

            Body.applyForce(box, box.position, {
              x: netForce,
              y: 0
            });
          } else {
            // Applied force is below static friction threshold - no motion
            Body.setVelocity(box, { x: 0, y: 0 });
          }
        } else {
          // Box is already moving - apply net force (applied - kinetic friction)
          const velocityDirection = box.velocity.x > 0 ? 1 : -1;
          const frictionForce = -velocityDirection * kineticFrictionForce;
          const netForce = params.appliedForce + frictionForce;

          Body.applyForce(box, box.position, {
            x: netForce,
            y: 0
          });

          // If the net force would reverse the velocity, stop the box instead
          // This prevents oscillation when forces balance
          const expectedAccel = netForce / mass;
          const wouldReverse = (velocityDirection > 0 && expectedAccel < 0 && Math.abs(expectedAccel) > Math.abs(box.velocity.x)) ||
                               (velocityDirection < 0 && expectedAccel > 0 && Math.abs(expectedAccel) > Math.abs(box.velocity.x));

          if (wouldReverse && Math.abs(box.velocity.x) < 0.5) {
            Body.setVelocity(box, { x: 0, y: box.velocity.y });
          }
        }
      }
    });

    // Update stats on each frame
    Events.on(engine, 'afterUpdate', function() {
      if (boxRef.current) {
        const vel = boxRef.current.velocity.x;
        const pos = boxRef.current.position.x;
        const mass = boxRef.current.mass;
        const normalForce = mass * Math.abs(engine.gravity.y);
        const staticFrictionForce = params.staticFriction * normalForce;
        const kineticFrictionForce = params.friction * normalForce;

        const isMoving = Math.abs(vel) > 0.01;
        const velocityDirection = vel > 0 ? 1 : -1;
        const frictionForce = isMoving ? -velocityDirection * kineticFrictionForce : 0;
        const appliedForce = forceActive ? params.appliedForce : 0;
        const netForce = appliedForce + frictionForce;
        const acceleration = mass > 0 ? netForce / mass : 0;

        setStats({
          velocity: vel,
          position: pos,
          appliedForce: appliedForce,
          staticFrictionForce: staticFrictionForce,
          kineticFrictionForce: kineticFrictionForce,
          netForce: netForce,
          normalForce: normalForce,
          mass: mass,
          acceleration: acceleration
        });
      }
    });

    // Create runner
    const runner = Runner.create();
    runnerRef.current = runner;

    // Only start runner if not paused
    if (!isPaused) {
      Runner.run(runner, engine);
    }

    Render.run(render);

    // Cleanup
    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [params, forceActive, isPaused]);

  // Custom rendering for force vectors
  useEffect(() => {
    if (!renderRef.current || !boxRef.current) return;

    const render = renderRef.current;
    const canvas = render.canvas;
    const context = render.context;

    const drawVectors = () => {
      if (!boxRef.current || isPaused) return;

      const box = boxRef.current;
      const scale = 10000; // Scale factor for visualization

      // Draw applied force vector (green)
      if (params.appliedForce !== 0) {
        const forceLength = Math.abs(params.appliedForce) * scale;
        const forceDir = params.appliedForce > 0 ? 1 : -1;

        context.strokeStyle = '#4CAF50';
        context.fillStyle = '#4CAF50';
        context.lineWidth = 3;

        // Arrow line
        context.beginPath();
        context.moveTo(box.position.x, box.position.y);
        context.lineTo(box.position.x + forceLength * forceDir, box.position.y);
        context.stroke();

        // Arrow head
        const headSize = 10;
        context.beginPath();
        context.moveTo(box.position.x + forceLength * forceDir, box.position.y);
        context.lineTo(box.position.x + forceLength * forceDir - headSize * forceDir, box.position.y - headSize/2);
        context.lineTo(box.position.x + forceLength * forceDir - headSize * forceDir, box.position.y + headSize/2);
        context.closePath();
        context.fill();

        // Label
        context.font = '14px Arial';
        context.fillText('Applied Force', box.position.x + forceLength * forceDir / 2 - 40, box.position.y - 15);
      }

      // Draw velocity vector (blue)
      if (Math.abs(box.velocity.x) > 0.1) {
        const velLength = Math.abs(box.velocity.x) * 20;
        const velDir = box.velocity.x > 0 ? 1 : -1;

        context.strokeStyle = '#2196F3';
        context.fillStyle = '#2196F3';
        context.lineWidth = 2;

        // Arrow line
        context.beginPath();
        context.moveTo(box.position.x, box.position.y - 40);
        context.lineTo(box.position.x + velLength * velDir, box.position.y - 40);
        context.stroke();

        // Arrow head
        const headSize = 8;
        context.beginPath();
        context.moveTo(box.position.x + velLength * velDir, box.position.y - 40);
        context.lineTo(box.position.x + velLength * velDir - headSize * velDir, box.position.y - 40 - headSize/2);
        context.lineTo(box.position.x + velLength * velDir - headSize * velDir, box.position.y - 40 + headSize/2);
        context.closePath();
        context.fill();

        // Label
        context.font = '12px Arial';
        context.fillText('Velocity', box.position.x + velLength * velDir / 2 - 20, box.position.y - 50);
      }

      requestAnimationFrame(drawVectors);
    };

    if (!isPaused) {
      drawVectors();
    }
  }, [isPaused, params.appliedForce]);

  const handleTogglePause = () => {
    if (isPaused) {
      // Starting simulation - set up force delay timer
      setForceActive(false);
      if (forceTimerRef.current) {
        clearTimeout(forceTimerRef.current);
      }

      forceTimerRef.current = setTimeout(() => {
        setForceActive(true);
      }, params.forceDelay);

      Matter.Runner.run(runnerRef.current, engineRef.current);
    } else {
      // Pausing - clear timer
      if (forceTimerRef.current) {
        clearTimeout(forceTimerRef.current);
      }
      setForceActive(false);
      Matter.Runner.stop(runnerRef.current);
    }
    setIsPaused(!isPaused);
  };

  const handleReset = () => {
    if (forceTimerRef.current) {
      clearTimeout(forceTimerRef.current);
    }
    setForceActive(false);
    setParams({ ...params });
    setIsPaused(true);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (forceTimerRef.current) {
        clearTimeout(forceTimerRef.current);
      }
    };
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ textAlign: 'center', color: '#333' }}>
        Applied Force & Friction Explorer
      </h2>
      <p style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
        Adjust the applied force and friction coefficients to see how they affect motion
      </p>

      <div style={{
        marginBottom: '20px',
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            <strong>Applied Force (horizontal):</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{params.appliedForce.toFixed(4)} N</span>
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="number"
              value={params.appliedForce.toFixed(4)}
              onChange={(e) => setParams({...params, appliedForce: parseFloat(e.target.value)})}
              step="0.001"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
            N
          </label>
          <input
            type="range"
            min="-0.005"
            max="100.000"
            step="0.1"
            value={params.appliedForce}
            onChange={(e) => setParams({...params, appliedForce: parseFloat(e.target.value)})}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999' }}>
            <span>← Left</span>
            <span>Right →</span>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            <strong>Kinetic Friction Coefficient:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{params.friction.toFixed(3)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.001"
            value={params.friction}
            onChange={(e) => setParams({...params, friction: parseFloat(e.target.value)})}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            <strong>Static Friction Coefficient (μ_s):</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{params.staticFriction.toFixed(3)}</span>
          </label>
            <label style={{ display: 'block' }}>
            <input
              type="number"
              min="0"
              max="100"
              value={params.staticFriction.toFixed(4)}
              onChange={(e) => setParams({...params, staticFriction: parseFloat(e.target.value)})}
              step="0.01"
              style={{ marginLeft: '10px', padding: '5px', width: '80px' }}
            />
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="0.001"
            value={params.staticFriction}
            onChange={(e) => setParams({...params, staticFriction: parseFloat(e.target.value)})}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            <strong>Force Application Delay:</strong>
            <span style={{ marginLeft: '10px', color: '#666' }}>{(params.forceDelay / 1000).toFixed(1)}s</span>
          </label>
          <input
            type="range"
            min="0"
            max="5000"
            step="100"
            value={params.forceDelay}
            onChange={(e) => setParams({...params, forceDelay: parseFloat(e.target.value)})}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
            Force will be applied {(params.forceDelay / 1000).toFixed(1)} seconds after pressing Play
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={handleTogglePause}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: isPaused ? '#FF9800' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>

        <button
          onClick={handleReset}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset Simulation
        </button>
      </div>

      <div ref={sceneRef} style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '20px'
      }} />

      <div style={{
        padding: '15px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        fontFamily: 'monospace',
        fontSize: '14px'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#4CAF50' }}>Box Mass:</strong> {stats.mass.toFixed(2)} kg
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#4CAF50' }}>Box Velocity:</strong> {stats.velocity.toFixed(3)} m/s
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong style={{ color: '#4CAF50' }}>Box Position:</strong> {stats.position.toFixed(1)} px
        </div>
        <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
          <strong>Applied Force:</strong> {params.appliedForce.toFixed(4)} N
          <span style={{ marginLeft: '10px', color: forceActive ? '#4CAF50' : '#FF9800' }}>
            {forceActive ? '(ACTIVE)' : '(WAITING)'}
          </span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Normal Force:</strong> {stats.normalForce.toFixed(4)} N
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Max Static Friction (μ_s × N):</strong> {stats.staticFrictionForce.toFixed(4)} N
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Kinetic Friction (μ_k × N):</strong> {stats.kineticFrictionForce.toFixed(4)} N
        </div>
        <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
          <strong>Net Force:</strong> {stats.netForce.toFixed(4)} N
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
            (Applied {stats.appliedForce >= 0 ? '+' : ''}{stats.appliedForce.toFixed(4)} - Friction)
          </div>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Expected Acceleration:</strong> {stats.acceleration.toFixed(6)} m/s²
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
            (F_net/m = {stats.netForce.toFixed(4)}/{stats.mass.toFixed(2)})
          </div>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <strong>Motion Status:</strong> {Math.abs(stats.velocity) < 0.01 ?
            (Math.abs(params.appliedForce) > stats.staticFrictionForce ?
              <span style={{ color: '#4CAF50' }}>Will start moving</span> :
              <span style={{ color: '#f44336' }}>At rest (F &lt; μ_s × N)</span>) :
            <span style={{ color: '#2196F3' }}>Moving with kinetic friction</span>
          }
        </div>
        <div style={{ marginTop: '15px', padding: '10px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px' }}>
          <div><strong>Legend:</strong></div>
          <div style={{ color: '#4CAF50' }}>● Green Arrow = Applied Force</div>
          <div style={{ color: '#2196F3' }}>● Blue Arrow = Velocity</div>
          <div style={{ marginTop: '8px' }}><strong>Physics:</strong></div>
          <div>Static friction force = μ_s × Normal Force</div>
          <div>Box moves when: |Applied Force| &gt; Static Friction</div>
        </div>
      </div>
    </div>
  );
}

// Main App with Tabs
export default function App() {
  const [activeTab, setActiveTab] = useState('momentum');

  const tabStyle = (tabName) => ({
    padding: '12px 24px',
    fontSize: '16px',
    background: activeTab === tabName ? '#2196F3' : '#e0e0e0',
    color: activeTab === tabName ? 'white' : '#333',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    marginRight: '5px',
    fontWeight: activeTab === tabName ? 'bold' : 'normal'
  });

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <div style={{
        background: '#f0f0f0',
        padding: '10px 20px',
        borderBottom: '2px solid #ccc'
      }}>
        <button
          onClick={() => setActiveTab('momentum')}
          style={tabStyle('momentum')}
        >
          Momentum Conservation
        </button>
        <button
          onClick={() => setActiveTab('friction')}
          style={tabStyle('friction')}
        >
          Friction Testing
        </button>
        <button
          onClick={() => setActiveTab('forces')}
          style={tabStyle('forces')}
        >
          Applied Forces
        </button>
      </div>

      <div>
        {activeTab === 'momentum' && <MomentumSimulation />}
        {activeTab === 'friction' && <FrictionSimulation />}
        {activeTab === 'forces' && <AppliedForceSimulation />}
      </div>
    </div>
  );
}