import { registerBody } from '../registry';
import type { VertexBodyConfig } from '../types';
import { decomposePolygonShape } from '../../../../physics/shapeHelpers';
import type { ShapeDescriptor } from '../../../../physics/types';

function createVertex(config: VertexBodyConfig): ShapeDescriptor {
  return decomposePolygonShape(config.vertices);
}

registerBody('vertex', createVertex);

export default createVertex;
