"use client";

import {
  annotationPath,
  type EvidenceAnnotationElement,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

export default function EvidenceOverlay({
  elements,
  interactive = false,
}: {
  elements: EvidenceAnnotationElement[];
  interactive?: boolean;
}) {
  if (elements.length === 0) return null;

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className={`absolute inset-0 h-full w-full ${interactive ? "" : "pointer-events-none"}`}
      aria-label="Image markup"
    >
      <defs>
        {elements
          .filter((element) => element.type === "arrow")
          .map((element) => (
            <marker
              key={`marker-${element.id}`}
              id={`arrow-${element.id}`}
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={element.color} />
            </marker>
          ))}
      </defs>
      {elements.map((element) => {
        if (element.type === "path") {
          return (
            <path
              key={element.id}
              d={annotationPath(element.points)}
              fill="none"
              stroke={element.color}
              strokeWidth={element.strokeWidth * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (element.type === "circle") {
          return (
            <ellipse
              key={element.id}
              cx={(element.x + element.width / 2) * 1000}
              cy={(element.y + element.height / 2) * 1000}
              rx={(element.width / 2) * 1000}
              ry={(element.height / 2) * 1000}
              fill="none"
              stroke={element.color}
              strokeWidth={element.strokeWidth * 2}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        if (element.type === "arrow") {
          return (
            <line
              key={element.id}
              x1={element.start.x * 1000}
              y1={element.start.y * 1000}
              x2={element.end.x * 1000}
              y2={element.end.y * 1000}
              stroke={element.color}
              strokeWidth={element.strokeWidth * 2}
              strokeLinecap="round"
              markerEnd={`url(#arrow-${element.id})`}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        return (
          <text
            key={element.id}
            x={element.x * 1000}
            y={element.y * 1000}
            fill={element.color}
            stroke="rgba(0,0,0,0.7)"
            strokeWidth="6"
            paintOrder="stroke"
            fontSize="48"
            fontWeight="700"
          >
            {element.text}
          </text>
        );
      })}
    </svg>
  );
}

