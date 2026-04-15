import { registerBody } from '../registry';
import type { CircleBodyConfig } from '../types';
import type { ShapeDescriptor } from '../../../../physics/types';

function createCircle(config: CircleBodyConfig): ShapeDescriptor {
  return { type: 'circle', radius: config.radius };
}

registerBody('circle', createCircle);

export default createCircle;
