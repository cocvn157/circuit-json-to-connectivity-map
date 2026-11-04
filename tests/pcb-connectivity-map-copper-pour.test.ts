import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

test("existing map queries connect traces through a shared copper pour", () => {
  const circuitJson = makeCopperPourCircuit()
  const traces: PCBTrace[] = [-4, 0, 4].map((x, index) => ({
    type: "pcb_trace",
    pcb_trace_id: `trace_${index}`,
    source_trace_id: `source_trace_${index}`,
    route: [
      {
        route_type: "wire",
        x,
        y: 0,
        layer: "top",
        width: 0.2,
        start_pcb_port_id: `port_${index}`,
      },
      { route_type: "wire", x, y: 4, layer: "top", width: 0.2 },
    ],
  }))
  const map = new PcbConnectivityMap([...circuitJson, ...traces])

  expect(map.connMap.areIdsConnected("pour_gnd", "port_0")).toBe(true)
  expect(map.connMap.areIdsConnected("port_0", "port_1")).toBe(true)
  expect(map.connMap.areIdsConnected("port_0", "port_2")).toBe(false)
  expect(map.areTracesConnected("trace_0", "trace_1")).toBe(true)
  expect(map.areTracesConnected("trace_0", "trace_2")).toBe(false)
  expect(
    map
      .getAllTracesConnectedToPort("port_0")
      .map((trace) => trace.pcb_trace_id),
  ).toEqual(expect.arrayContaining(["trace_0", "trace_1"]))
  expect(
    map
      .getAllTracesConnectedToTrace("trace_0")
      .map((trace) => trace.pcb_trace_id),
  ).not.toContain("trace_2")
  expect(
    map
      .getCopperConductorComponents()
      .flat()
      .some((conductor) => "polygon" in conductor),
  ).toBe(false)
})
