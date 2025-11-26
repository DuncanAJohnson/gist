import type Matter from 'matter-js';
import type { 
  BodyConfig, ObjectConfig, 
  RectangleBodyConfig, CircleBodyConfig, PolygonBodyConfig, VertexBodyConfig 
} from '../../../schemas/simulation';

export type { BodyConfig, ObjectConfig, RectangleBodyConfig, CircleBodyConfig, PolygonBodyConfig, VertexBodyConfig };

export type BodyFactory<T extends BodyConfig = BodyConfig> = (
  x: number,
  y: number,
  config: T
) => Matter.Body;
