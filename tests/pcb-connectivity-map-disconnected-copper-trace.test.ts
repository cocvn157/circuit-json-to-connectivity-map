import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

test("disconnected segments sharing a trace ID cannot join isolated pours", () => {
  const circuitJson = makeCopperPourCircuit()
  circuitJson.push({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour_right",
    source_net_id: "gnd",
    covered_with_solder_mask: false,
    shape: "rect",
    center: { x: 4, y: 0 },
    width: 2,
    height: 4,
    layer: "top",
  })
  const leftTrace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "left_trace",
    source_trace_id: "source_trace_1",
    route: [
      { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 0, y: 1, width: 0.2, layer: "top" },
    ],
  }
  const rightTrace: PCBTrace = {
    ...leftTrace,
    pcb_trace_id: "right_trace",
    route: [
      { route_type: "wire", x: 4, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 4, y: 1, width: 0.2, layer: "top" },
    ],
  }
  const brokenTrace: PCBTrace = {
    ...leftTrace,
    pcb_trace_id: "broken_trace",
    route: [
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "port_1",
      },
      { route_type: "wire", x: 1, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 2, y: 0, width: 0.2, layer: "bottom" },
      { route_type: "wire", x: 3, y: 0, width: 0.2, layer: "top" },
      {
        route_type: "wire",
        x: 4,
        y: 0,
        width: 0.2,
        layer: "top",
        end_pcb_port_id: "port_2",
      },
    ],
  }
  circuitJson.push(leftTrace, rightTrace)
  const map = new PcbConnectivityMap([...circuitJson, brokenTrace])
  const groups = map
    .getCopperConductorComponents()
    .filter((group) => group.some((c) => c.traceId === "broken_trace"))
  expect(groups).toHaveLength(2)
  expect(map.connMap.areIdsConnected("pour_gnd", "pour_right")).toBe(false)
  expect(map.connMap.areIdsConnected("port_1", "port_2")).toBe(false)
  expect(map.areTracesConnected("left_trace", "right_trace")).toBe(false)
  expect(map.connMap.getNetConnectedToId("broken_trace")).toBeUndefined()
  expect(map.getAllTracesConnectedToPort("port_0")).toEqual([leftTrace])
  expect(map.getAllTracesConnectedToPort("port_2")).toEqual([rightTrace])

  const incrementalMap = new PcbConnectivityMap(circuitJson)
  incrementalMap.addTrace(brokenTrace)
  expect(incrementalMap.connMap.areIdsConnected("pour_gnd", "pour_right")).toBe(
    false,
  )
  expect(incrementalMap.connMap.areIdsConnected("port_1", "port_2")).toBe(false)
  expect(incrementalMap.areTracesConnected("left_trace", "right_trace")).toBe(
    false,
  )
  expect(
    incrementalMap.connMap.getNetConnectedToId("broken_trace"),
  ).toBeUndefined()

  incrementalMap.addTrace({
    ...leftTrace,
    pcb_trace_id: "physical_bridge",
    route: [
      { route_type: "wire", x: 0, y: 1, width: 0.2, layer: "top" },
      { route_type: "wire", x: 2, y: 1, width: 0.2, layer: "top" },
      { route_type: "wire", x: 4, y: 1, width: 0.2, layer: "top" },
    ],
  })
  expect(incrementalMap.connMap.areIdsConnected("pour_gnd", "pour_right")).toBe(
    true,
  )
  expect(incrementalMap.areTracesConnected("left_trace", "right_trace")).toBe(
    true,
  )
  expect(
    incrementalMap.areTracesConnected("broken_trace", "physical_bridge"),
  ).toBe(true)
})
