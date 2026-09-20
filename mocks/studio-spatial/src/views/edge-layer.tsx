import { Fragment } from 'react';
import type { EdgeModel } from '../display.types';
import { relationLabels } from '../labels';

export function EdgeLayer({
  edges,
  width,
  height,
}: {
  readonly edges: readonly EdgeModel[];
  readonly width: number;
  readonly height: number;
}) {
  return (
    <svg id="map-wires" width={width} height={height} aria-hidden="true">
      <EdgeMarkers />
      {edges.map((edge) => (
        <Fragment key={edge.key}>
          <path
            className={`wire edge-${edge.kind}`}
            data-from={edge.from}
            data-to={edge.to}
            data-count={edge.ids.length}
            data-edges={edge.ids.join(',')}
            d={edge.path}
            markerEnd={`url(#${edge.kind === 'read' ? 'dot' : 'arrow'}-${edge.kind})`}
          >
            <title>{edge.title}</title>
          </path>
          {edge.count && (
            <text className="bundle-count" x={edge.count.x} y={edge.count.y}>
              {edge.count.text}
              <title>{edge.title}</title>
            </text>
          )}
        </Fragment>
      ))}
    </svg>
  );
}

function EdgeMarkers() {
  return (
    <defs>
      {Object.keys(relationLabels).map((kind) => (
        <Fragment key={kind}>
          <marker
            id={`arrow-${kind}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path className={`edge-${kind}`} d="M 1 1 L 9 5 L 1 9" fill="none" strokeWidth="1.6" />
          </marker>
          <marker
            id={`dot-${kind}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
          >
            <circle className={`edge-${kind}`} cx="5" cy="5" r="3" fill="white" />
          </marker>
        </Fragment>
      ))}
    </defs>
  );
}
