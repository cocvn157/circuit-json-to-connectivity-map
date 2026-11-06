import { test, expect } from "bun:test"
import { PcbConnectivityMap } from "../src/PcbConnectivityMap"
import type { AnyCircuitElement, PCBTrace } from "circuit-json"

test("PcbConnectivityMap should correctly identify connected traces and ports", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_trace",
      pcb_trace_id: "trace1",
      route: [
        {
          x: 0,
          y: 0,
          route_type: "wire",
          width: 1,
          layer: "top",
          start_pcb_port_id: "port1",
        },
        { x: 10, y: 0, route_type: "wire", width: 1, layer: "top" },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "trace2",
      route: [
        { x: 5, y: 0, route_type: "wire", width: 1, layer: "top" },
        { x: 15, y: 0, route_type: "wire", width: 1, layer: "top" },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "trace3",
      route: [
        { x: 20, y: 0, route_type: "wire", width: 1, layer: "top" },
        {
          x: 30,
          y: 0,
          route_type: "wire",
          width: 1,
          layer: "top",
          end_pcb_port_id: "port2",
        },
      ],
    },
    {
      type: "pcb_port",
      pcb_port_id: "port1",
      x: 0,
      y: 0,
      source_port_id: "source_port1",
      pcb_component_id: "component1",
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "port2",
      x: 30,
      y: 0,
      source_port_id: "source_port2",
      pcb_component_id: "component2",
      layers: ["top"],
    },
  ]

  const pcbConnectivityMap = new PcbConnectivityMap(circuitJson)

  // Test trace connections
  expect(pcbConnectivityMap.areTracesConnected("trace1", "trace2")).toBe(true)
  expect(pcbConnectivityMap.areTracesConnected("trace1", "trace3")).toBe(false)
  expect(pcbConnectivityMap.areTracesConnected("trace2", "trace3")).toBe(false)

  const connectedTraces =
    pcbConnectivityMap.getAllTracesConnectedToTrace("trace1")
  expect(connectedTraces.map((trace) => trace.pcb_trace_id)).toContain("trace2")
  expect(connectedTraces.map((trace) => trace.pcb_trace_id)).not.toContain(
    "trace3",
  )

  // Test port connections
  const tracesConnectedToPort1 =
    pcbConnectivityMap.getAllTracesConnectedToPort("port1")
  expect(tracesConnectedToPort1.map((trace) => trace.pcb_trace_id)).toContain(
    "trace1",
  )
  expect(tracesConnectedToPort1.map((trace) => trace.pcb_trace_id)).toContain(
    "trace2",
  )
  expect(
    tracesConnectedToPort1.map((trace) => trace.pcb_trace_id),
  ).not.toContain("trace3")

  const tracesConnectedToPort2 =
    pcbConnectivityMap.getAllTracesConnectedToPort("port2")
  expect(tracesConnectedToPort2.map((trace) => trace.pcb_trace_id)).toContain(
    "trace3",
  )
  expect(
    tracesConnectedToPort2.map((trace) => trace.pcb_trace_id),
  ).not.toContain("trace1")
  expect(
    tracesConnectedToPort2.map((trace) => trace.pcb_trace_id),
  ).not.toContain("trace2")
})

test("PcbConnectivityMap should initialize empty when no circuit JSON is provided", () => {
  const emptyPcbConnectivityMap = new PcbConnectivityMap()

  expect(emptyPcbConnectivityMap.circuitJson).toEqual([])
  expect(emptyPcbConnectivityMap.traceIdToElm.size).toBe(0)
  expect(emptyPcbConnectivityMap.portIdToElm.size).toBe(0)
  expect(Object.keys(emptyPcbConnectivityMap.connMap.netMap).length).toBe(0)

  // Test adding a trace to the empty map
  const newTrace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "trace1",
    route: [
      {
        x: 0,
        y: 0,
        route_type: "wire",
        width: 1,
        layer: "top",
        start_pcb_port_id: "port1",
      },
      {
        x: 10,
        y: 0,
        route_type: "wire",
        width: 1,
        layer: "top",
        end_pcb_port_id: "port2",
      },
    ],
  }

  emptyPcbConnectivityMap.addTrace(newTrace)

  expect(emptyPcbConnectivityMap.traceIdToElm.size).toBe(1)
  expect(emptyPcbConnectivityMap.traceIdToElm.get("trace1")).toEqual(newTrace)
  expect(
    emptyPcbConnectivityMap.connMap.areIdsConnected("trace1", "port1"),
  ).toBe(true)
  expect(
    emptyPcbConnectivityMap.connMap.areIdsConnected("trace1", "port2"),
  ).toBe(true)
  expect(
    emptyPcbConnectivityMap.connMap.areIdsConnected("port1", "port2"),
  ).toBe(true)
})

test("PcbConnectivityMap.addTrace should correctly add a new trace and update connections", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_trace",
      pcb_trace_id: "trace1",
      route: [
        {
          x: 0,
          y: 0,
          route_type: "wire",
          width: 1,
          layer: "top",
          start_pcb_port_id: "port1",
        },
        {
          x: 10,
          y: 0,
          route_type: "wire",
          width: 1,
          layer: "top",
          end_pcb_port_id: "port2",
        },
      ],
    },
    {
      type: "pcb_port",
      pcb_port_id: "port1",
      x: 0,
      y: 0,
      source_port_id: "source_port1",
      pcb_component_id: "component1",
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "port2",
      x: 20,
      y: 0,
      source_port_id: "source_port2",
      pcb_component_id: "component2",
      layers: ["top"],
    },
  ]

  const pcbConnectivityMap = new PcbConnectivityMap(circuitJson)

  const newTrace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "trace2",
    route: [
      {
        x: 10,
        y: 0,
        route_type: "wire",
        width: 1,
        layer: "top",
        start_pcb_port_id: "port2",
      },
      {
        x: 20,
        y: 0,
        route_type: "wire",
        width: 1,
        layer: "top",
        end_pcb_port_id: "port3",
      },
    ],
  }

  pcbConnectivityMap.addTrace(newTrace)

  // Test if the new trace is connected to trace1
  expect(pcbConnectivityMap.areTracesConnected("trace1", "trace2")).toBe(true)

  // Test if the new trace is connected to both ports
  const tracesConnectedToPort1 =
    pcbConnectivityMap.getAllTracesConnectedToPort("port1")
  const tracesConnectedToPort2 =
    pcbConnectivityMap.getAllTracesConnectedToPort("port2")
  const tracesConnectedToPort3 =
    pcbConnectivityMap.getAllTracesConnectedToPort("port3")

  expect(tracesConnectedToPort1.map((trace) => trace.pcb_trace_id)).toContain(
    "trace2",
  )
  expect(tracesConnectedToPort2.map((trace) => trace.pcb_trace_id)).toContain(
    "trace2",
  )
  expect(tracesConnectedToPort3.map((trace) => trace.pcb_trace_id)).toContain(
    "trace2",
  )
  expect(tracesConnectedToPort3.map((trace) => trace.pcb_trace_id)).toContain(
    "trace1",
  )

  // Test if all elements are now connected
  expect(
    pcbConnectivityMap.connMap.areAllIdsConnected([
      "trace1",
      "trace2",
      "port1",
      "port2",
      "port3",
    ]),
  ).toBe(true)
})

test("PcbConnectivityMap.addTrace connects a trace that overlaps an existing trace without shared port IDs", () => {
  const pcbConnectivityMap = new PcbConnectivityMap([
    {
      type: "pcb_trace",
      pcb_trace_id: "trace1",
      route: [
        {
          x: 0,
          y: 0,
          route_type: "wire",
          width: 1,
          layer: "top",
          start_pcb_port_id: "port1",
        },
        { x: 10, y: 0, route_type: "wire", width: 1, layer: "top" },
      ],
    },
    {
      type: "pcb_port",
      pcb_port_id: "port1",
      x: 0,
      y: 0,
      source_port_id: "source_port1",
      pcb_component_id: "component1",
      layers: ["top"],
    },
  ])

  pcbConnectivityMap.addTrace({
    type: "pcb_trace",
    pcb_trace_id: "trace2",
    route: [
      { x: 5, y: 0, route_type: "wire", width: 1, layer: "top" },
      { x: 15, y: 0, route_type: "wire", width: 1, layer: "top" },
    ],
  })

  expect(pcbConnectivityMap.areTracesConnected("trace1", "trace2")).toBe(true)
  expect(
    pcbConnectivityMap
      .getAllTracesConnectedToPort("port1")
      .map((trace) => trace.pcb_trace_id),
  ).toEqual(["trace1", "trace2"])
})
