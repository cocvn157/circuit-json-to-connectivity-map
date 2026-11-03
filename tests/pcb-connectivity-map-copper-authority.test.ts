import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"
import { makeCopperPourCircuit } from "./fixtures/copper-pour-circuit"

const makeTrace = (id: string, x: number): PCBTrace => ({
  type: "pcb_trace",
  pcb_trace_id: id,
  source_trace_id: "source_trace_0",
  route: [
    { route_type: "wire", x, y: 0, layer: "top", width: 0.2 },
    { route_type: "wire", x: x + 0.5, y: 0, layer: "top", width: 0.2 },
  ],
})

const addEndpoint = (trace: PCBTrace, portId: string) => {
  const first = trace.route[0]!
  if (first.route_type !== "wire") throw new Error("Expected a wire")
  first.start_pcb_port_id = portId
}

test("a stale endpoint reference cannot override a port's physical component", () => {
  const trace = makeTrace("left_trace", 0)
  addEndpoint(trace, "port_2") // Its pad is at x=4, beyond this trace.
  const map = new PcbConnectivityMap([...makeCopperPourCircuit(), trace])
  expect(map.connMap.areIdsConnected("pour_gnd", "left_trace")).toBe(true)
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
  expect(map.getAllTracesConnectedToPort("port_2")).toEqual([])
})

test("shared endpoint aliases cannot merge separate copper components", () => {
  const left = makeTrace("left_trace", 0)
  const right = makeTrace("right_trace", 4)
  addEndpoint(left, "shared_alias")
  addEndpoint(right, "shared_alias")
  const map = new PcbConnectivityMap([...makeCopperPourCircuit(), left, right])
  expect(map.areTracesConnected("left_trace", "right_trace")).toBe(false)
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
  expect(map.connMap.getNetConnectedToId("shared_alias")).toBeUndefined()
  expect(
    map.getAllTracesConnectedToPort("port_2").map((t) => t.pcb_trace_id),
  ).toEqual(["right_trace"])
})

test("adding a second component removes an endpoint alias that becomes ambiguous", () => {
  const left = makeTrace("left_trace", 0)
  const right = makeTrace("right_trace", 4)
  addEndpoint(left, "shared_alias")
  addEndpoint(right, "shared_alias")
  const map = new PcbConnectivityMap([...makeCopperPourCircuit(), left])
  expect(map.connMap.areIdsConnected("pour_gnd", "shared_alias")).toBe(true)
  map.addTrace(right)
  expect(map.connMap.getNetConnectedToId("shared_alias")).toBeUndefined()
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
  expect(map.areTracesConnected("left_trace", "right_trace")).toBe(false)
})

test("a port ID shared by disconnected pads does not short their copper groups", () => {
  const circuit = makeCopperPourCircuit()
  const rightPad = circuit.find(
    (e) => e.type === "pcb_smtpad" && e.pcb_smtpad_id === "pad_2",
  )!
  if (rightPad.type !== "pcb_smtpad") throw new Error("Expected a pad")
  rightPad.pcb_port_id = "port_0"
  const right = makeTrace("right_trace", 4)
  const map = new PcbConnectivityMap([...circuit, right])
  expect(map.connMap.areIdsConnected("pour_gnd", "right_trace")).toBe(false)
  expect(map.connMap.getNetConnectedToId("port_0")).toBeUndefined()
  expect(
    map
      .getCopperConductorComponents()
      .filter((group) => group.some((c) => c.pcbPortIds?.includes("port_0"))),
  ).toHaveLength(2)
})

test("an analyzed trace without conducting segments cannot connect its endpoint IDs", () => {
  const trace = makeTrace("no_copper", 0)
  addEndpoint(trace, "port_1")
  trace.route[1] = {
    route_type: "wire",
    x: 4,
    y: 0,
    layer: "bottom",
    width: 0.2,
    end_pcb_port_id: "port_2",
  }
  const map = new PcbConnectivityMap([...makeCopperPourCircuit(), trace])
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
  expect(map.connMap.getNetConnectedToId("no_copper")).toBeUndefined()
})

test("legacy trace intersections cannot bridge copper-analyzed components", () => {
  const left = makeTrace("left_trace", 0)
  const right = makeTrace("right_trace", 4)
  const unassigned = makeTrace("unassigned", 0)
  delete unassigned.source_trace_id
  unassigned.route[1] = {
    route_type: "wire",
    x: 4,
    y: 0,
    layer: "top",
    width: 0.2,
  }
  const map = new PcbConnectivityMap([
    ...makeCopperPourCircuit(),
    left,
    right,
    unassigned,
  ])
  expect(map.areTracesConnected("left_trace", "right_trace")).toBe(false)
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
})

test("adding and replacing a trace updates physical connectivity without stale endpoint links", () => {
  const circuit = makeCopperPourCircuit()
  const map = new PcbConnectivityMap(circuit)
  const bridge = makeTrace("bridge", 0)
  bridge.route[1] = { route_type: "wire", x: 4, y: 0, layer: "top", width: 0.2 }
  map.addTrace(bridge)
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(true)
  const replacement = makeTrace("bridge", 0)
  addEndpoint(replacement, "port_2")
  map.addTrace(replacement)
  const fresh = new PcbConnectivityMap([...circuit, replacement])
  expect(map.connMap.areIdsConnected("pour_gnd", "port_2")).toBe(false)
  expect(map.getAllTracesConnectedToPort("port_2")).toEqual(
    fresh.getAllTracesConnectedToPort("port_2"),
  )
})
