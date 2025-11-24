export interface BaseBodyProps {
    type: string;
    color?: string;
}

export interface RectangleBody extends BaseBodyProps {
    type: 'rectangle';
    width: number;
    height: number;
}

export interface CircleBody extends BaseBodyProps {
    type: 'circle';
    radius: number;
}

export interface PolygonBody extends BaseBodyProps {
    type: 'polygon';
    sides: number;
    radius: number;
}

export interface VertexBody extends BaseBodyProps {
    type: 'vertex';
    vertices: Matter.Vector[];
}

export type Body = RectangleBody | CircleBody | PolygonBody | VertexBody;