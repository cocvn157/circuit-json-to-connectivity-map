import { expect, test } from "bun:test"
import type { AnyCircuitElement, PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"

const makeCircuit = (): AnyCircuitElement[] => [
  {
    type: "source_trace",
    source_trace_id: "gnd_trace",
    connected_source_net_ids: ["gnd"],
    connected_source_port_ids: ["source_ground"],
  },
  {
    type: "pcb_copper_pour",
    pcb_copper_pour_id: "pour",
    source_net_id: "gnd",
    shape: "rect",
    center: { x: -0.5, y: 0 },
    width: 1.5,
    height: 2,
    layer: "top",
    covered_with_solder_mask: false,
  },
  ...[
    [-0.5, "ground"],
    [0, "left"],
    [4, "right"],
  ].flatMap(([x, name]): AnyCircuitElement[] => [
    {
      type: "pcb_port",
      pcb_port_id: `port_${name}`,
      source_port_id: `source_${name}`,
      x: Number(x),
      y: 0,
      layers: ["top"],
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: `pad_${name}`,
      pcb_port_id: `port_${name}`,
      shape: "circle",
      x: Number(x),
      y: 0,
      radius: 0.15,
      layer: "top",
    },
  ]),
  {
    type: "pcb_trace",
    pcb_trace_id: "broken",
    route: [
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "port_left",
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
        end_pcb_port_id: "port_right",
      },
    ],
  },
]

test("adding a net-assigned trace removes stale links from newly eligible broken traces", () => {
  const circuit = makeCircuit()
  const map = new PcbConnectivityMap(circuit)
  expect(map.connMap.areIdsConnected("port_left", "port_right")).toBe(true)
  const joiningTrace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "join_ground",
    source_trace_id: "gnd_trace",
    route: [
      {
        route_type: "wire",
        x: -0.5,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "port_ground",
      },
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.2,
        layer: "top",
        end_pcb_port_id: "port_left",
      },
    ],
  }
  map.addTrace(joiningTrace)
  const fresh = new PcbConnectivityMap([...circuit, joiningTrace])
  expect(fresh.connMap.areIdsConnected("pour", "port_right")).toBe(false)
  expect(
    map
      .getCopperConductorComponents()
      .filter((group) => group.some((c) => c.traceId === "broken")),
  ).toHaveLength(2)
  expect(map.connMap.areIdsConnected("pour", "port_right")).toBe(false)
  expect(map.connMap.getNetConnectedToId("broken")).toBeUndefined()
  for (const id of [
    "port_ground",
    "port_left",
    "port_right",
    "broken",
    "join_ground",
  ]) {
    expect(map.connMap.areIdsConnected("pour", id)).toBe(
      fresh.connMap.areIdsConnected("pour", id),
    )
  }
})

test("a physical bridge restores endpoint references of previously excluded traces", () => {
  const circuit = makeCircuit()
  const trace = circuit.find((e) => e.type === "pcb_trace")!
  if (trace.type !== "pcb_trace") throw new Error("Expected a trace")
  trace.source_trace_id = "gnd_trace"
  const first = trace.route[0]!
  const last = trace.route[trace.route.length - 1]!
  if (first.route_type !== "wire" || last.route_type !== "wire")
    throw new Error("Expected endpoints")
  first.start_pcb_port_id = "left_alias"
  last.end_pcb_port_id = "right_alias"
  const map = new PcbConnectivityMap(circuit)
  expect(map.connMap.getNetConnectedToId("broken")).toBeUndefined()
  const bridge: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "bridge",
    source_trace_id: "gnd_trace",
    route: [
      { route_type: "wire", x: 0, y: 0, width: 0.2, layer: "top" },
      { route_type: "wire", x: 4, y: 0, width: 0.2, layer: "top" },
    ],
  }
  map.addTrace(bridge)
  const fresh = new PcbConnectivityMap([...circuit, bridge])
  expect(fresh.connMap.areIdsConnected("pour", "right_alias")).toBe(true)
  expect(map.connMap.areIdsConnected("pour", "right_alias")).toBe(true)
  expect(map.connMap.areIdsConnected("left_alias", "right_alias")).toBe(true)
  expect(
    map
      .getAllTracesConnectedToPort("right_alias")
      .map((t) => t.pcb_trace_id)
      .sort(),
  ).toEqual(["bridge", "broken"])
})
