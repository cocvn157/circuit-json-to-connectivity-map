import { expect, spyOn, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import * as wireGeometry from "../src/getWireSegmentPolygon"
import { makeStraightPcbTrace } from "./fixtures/make-straight-pcb-trace"

const makeTaper = (): PCBTrace => ({
  type: "pcb_trace",
  pcb_trace_id: "taper",
  route: [
    {
      route_type: "wire",
      x: 0,
      y: 0,
      layer: "top",
      width: 0.2,
      start_width: 0.2,
      end_width: 1,
      width_interpolation_mode: "quadratic",
    },
    { route_type: "wire", x: 2, y: 0, layer: "top", width: 1 },
  ],
})

test("distant trace pairs do not tessellate a quadratic taper", () => {
  const polygonSpy = spyOn(wireGeometry, "getWireSegmentPolygon")
  try {
    const traces = Array.from({ length: 300 }, (_, i) =>
      makeStraightPcbTrace(
        `distant_${i}`,
        "top",
        { x: 20, y: 10 + i },
        { x: 22, y: 10 + i },
      ),
    )
    const map = new PcbConnectivityMap([makeTaper(), ...traces])
    for (const trace of traces)
      expect(map.areTracesConnected("taper", trace.pcb_trace_id)).toBe(false)
    expect(polygonSpy).not.toHaveBeenCalled()
  } finally {
    polygonSpy.mockRestore()
  }
})

test("nearby trace pairs reuse taper geometry only within the current build", () => {
  const polygonSpy = spyOn(wireGeometry, "getWireSegmentPolygon")
  try {
    const taper = makeTaper()
    const probes = Array.from({ length: 8 }, (_, i) =>
      makeStraightPcbTrace(
        `probe_${i}`,
        "top",
        { x: 1.85 + i * 0.01, y: 0.4 },
        { x: 1.85 + i * 0.01, y: 0.42 },
      ),
    )
    const map = new PcbConnectivityMap([taper, ...probes])
    for (const probe of probes)
      expect(map.areTracesConnected("taper", probe.pcb_trace_id)).toBe(true)
    expect(
      polygonSpy.mock.calls.filter(([start]) => start === taper.route[0]),
    ).toHaveLength(1)

    // Keep the bounds overlapping while moving the wide end: reusing the old
    // polygon would incorrectly retain these contacts after replacement.
    const end = taper.route[1]!
    if (end.route_type !== "wire") throw new Error("Expected a wire endpoint")
    end.x = 3
    map.addTrace(taper)
    for (const probe of probes)
      expect(map.areTracesConnected("taper", probe.pcb_trace_id)).toBe(false)
    expect(
      polygonSpy.mock.calls.filter(([start]) => start === taper.route[0]),
    ).toHaveLength(2)
  } finally {
    polygonSpy.mockRestore()
  }
})
