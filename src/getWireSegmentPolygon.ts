import { Point, Polygon } from "@flatten-js/core"
import { getTraceSegmentPolygon } from "@tscircuit/circuit-json-util"
import type {
  PcbTraceRoutePointWire,
  Point as CircuitPoint,
} from "circuit-json"

// Bound quadratic chord error to the copper contact tolerance, in board mm.
const TAPER_TOLERANCE = 1e-7

/** Explicit wire profiles override legacy interpolated widths and have flat
 * caps. Quadratic sides follow Circuit JSON's pcb-trace-teardrops contract.
 */
export const getWireSegmentPolygon = (
  start: PcbTraceRoutePointWire,
  end: CircuitPoint,
  legacyEndWidth = start.width,
): Polygon => {
  if (!start.width_interpolation_mode)
    return getTraceSegmentPolygon(start, end, start.width, legacyEndWidth)

  const startWidth = start.start_width ?? start.width
  const endWidth = start.end_width ?? legacyEndWidth
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return new Polygon()
  const nx = -dy / length
  const ny = dx / length
  const quadratic = start.width_interpolation_mode === "quadratic"
  // For a quadratic half-width, the maximum chord error over a step h is
  // |endWidth - startWidth| * h^2 / 8. Linear profiles need only two ends.
  const steps = quadratic
    ? Math.max(
        1,
        Math.ceil(
          Math.sqrt(Math.abs(endWidth - startWidth) / (8 * TAPER_TOLERANCE)),
        ),
      )
    : 1
  const lower: Point[] = []
  const upper: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const fraction = quadratic
      ? startWidth <= endWidth
        ? t * t
        : 2 * t - t * t
      : t
    const radius = (startWidth + (endWidth - startWidth) * fraction) / 2
    const x = start.x + t * dx
    const y = start.y + t * dy
    lower.push(new Point(x - nx * radius, y - ny * radius))
    upper.push(new Point(x + nx * radius, y + ny * radius))
  }
  return new Polygon([...lower, ...upper.reverse()])
}
