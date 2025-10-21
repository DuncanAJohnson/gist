import React from 'react';
import JsonSimulation from '../components/JsonSimulation';
import twoBoxesConfig from './twoBoxes.json';

function TwoBoxesSimulation() {
  return <JsonSimulation config={twoBoxesConfig} />;
}

export default TwoBoxesSimulation;

