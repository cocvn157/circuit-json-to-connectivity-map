import { expect, test } from "bun:test"
import {
  pcb_trace,
  type AnyCircuitElement,
  type PCBTrace,
  type PcbTraceRoutePointWire,
} from "circuit-json"
import { PcbConnectivityMap } from "../src"

const makeTaper = (mode: "linear" | "quadratic", reverse = false): PCBTrace =>
  pcb_trace.parse({
    type: "pcb_trace",
    pcb_trace_id: "taper",
    source_trace_id: "source_trace",
    route: [
      {
        route_type: "wire",
        x: reverse ? 2 : 0,
        y: 0,
        layer: "top",
        width: reverse ? 1 : 0.2,
        start_width: reverse ? 1 : 0.2,
        end_width: reverse ? 0.2 : 1,
        width_interpolation_mode: mode,
      },
      {
        route_type: "wire",
        x: reverse ? 0 : 2,
        y: 0,
        layer: "top",
        width: reverse ? 0.2 : 1,
      },
    ],
  })

const circuitWithPour = (
  trace: PCBTrace,
  x: number,
  y: number,
): AnyCircuitElement[] => [
  {
    type: "source_trace",
    source_trace_id: "source_trace",
    connected_source_port_ids: [],
    connected_source_net_ids: ["gnd"],
  },
  trace,
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour",
    source_net_id: "gnd",
    shape: "rect",
    center: { x, y },
    width: 0.02,
    height: 0.02,
    layer: "top",
    covered_with_solder_mask: false,
  },
]

for (const reverse of [false, true]) {
  test(`quadratic taper preserves curved sides${reverse ? " when reversed" : ""}`, () => {
    const quadratic = makeTaper("quadratic", reverse)
    const linear = makeTaper("linear", reverse)
    // At x=1, the linear half-width is 0.3, but the quadratic half-width is 0.2.
    expect(
      new PcbConnectivityMap(
        circuitWithPour(linear, 1, 0.25),
      ).connMap.areIdsConnected("taper", "pour"),
    ).toBe(true)
    expect(
      new PcbConnectivityMap(
        circuitWithPour(quadratic, 1, 0.25),
      ).connMap.areIdsConnected("taper", "pour"),
    ).toBe(false)
    expect(
      new PcbConnectivityMap(
        circuitWithPour(quadratic, 1, 0.19),
      ).connMap.areIdsConnected("taper", "pour"),
    ).toBe(true)
  })

  test(`explicit taper has no round cap beyond its endpoint${reverse ? " when reversed" : ""}`, () => {
    expect(
      new PcbConnectivityMap(
        circuitWithPour(makeTaper("linear", reverse), 2.2, 0),
      ).connMap.areIdsConnected("taper", "pour"),
    ).toBe(false)
  })
}

test("explicit taper overrides the legacy route thickness mode", () => {
  const trace = makeTaper("linear")
  trace.route_thickness_mode = "interpolated"
  ;(trace.route[1] as PcbTraceRoutePointWire).width = 0.2
  expect(
    new PcbConnectivityMap(
      circuitWithPour(trace, 1.9, 0.4),
    ).connMap.areIdsConnected("taper", "pour"),
  ).toBe(true)
})

test("trace intersection links preserve the tapered shape", () => {
  const probe: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "probe",
    route: [
      { route_type: "wire", x: 0.99, y: 0.25, width: 0.02, layer: "top" },
      { route_type: "wire", x: 1.01, y: 0.25, width: 0.02, layer: "top" },
    ],
  }
  for (const reverse of [false, true]) {
    expect(
      new PcbConnectivityMap([
        makeTaper("linear", reverse),
        probe,
      ]).areTracesConnected("taper", "probe"),
    ).toBe(true)
    expect(
      new PcbConnectivityMap([
        makeTaper("quadratic", reverse),
        probe,
      ]).areTracesConnected("taper", "probe"),
    ).toBe(false)
  }
})

test("equal explicit widths form a flat-ended rectangle", () => {
  const trace = makeTaper("quadratic")
  ;(trace.route[0] as PcbTraceRoutePointWire).end_width = 0.2
  expect(
    new PcbConnectivityMap(
      circuitWithPour(trace, 1, 0.09),
    ).connMap.areIdsConnected("taper", "pour"),
  ).toBe(true)
  expect(
    new PcbConnectivityMap(
      circuitWithPour(trace, 1, 0.2),
    ).connMap.areIdsConnected("taper", "pour"),
  ).toBe(false)
})
