import type {
  BodyConfig, ObjectConfig,
  RectangleBodyConfig, CircleBodyConfig, PolygonBodyConfig, VertexBodyConfig
} from '../../../schemas/simulation';
import type { ShapeDescriptor } from '../../../physics/types';

export type { BodyConfig, ObjectConfig, RectangleBodyConfig, CircleBodyConfig, PolygonBodyConfig, VertexBodyConfig };

/**
 * A body factory emits an engine-agnostic SI ShapeDescriptor from a config.
 * Position and material properties are handled by ObjectRenderer through the
 * adapter; factories only describe geometry.
 */
export type BodyFactory<T extends BodyConfig = BodyConfig> = (config: T) => ShapeDescriptor;
