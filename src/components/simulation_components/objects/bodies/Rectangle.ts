import { registerBody } from '../registry';
import type { RectangleBodyConfig } from '../types';
import type { ShapeDescriptor } from '../../../../physics/types';

function createRectangle(config: RectangleBodyConfig): ShapeDescriptor {
  return { type: 'rectangle', width: config.width, height: config.height };
}

registerBody('rectangle', createRectangle);

export default createRectangle;
