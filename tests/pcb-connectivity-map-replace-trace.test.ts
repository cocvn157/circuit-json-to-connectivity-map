import { expect, test } from "bun:test"
import type { PCBTrace } from "circuit-json"
import { PcbConnectivityMap } from "../src"

test("trace replacement refreshes port references without separate port elements", () => {
  const map = new PcbConnectivityMap()
  const trace: PCBTrace = {
    type: "pcb_trace",
    pcb_trace_id: "trace",
    route: [
      {
        route_type: "wire",
        x: 0,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "old_port",
      },
      { route_type: "wire", x: 1, y: 0, width: 0.2, layer: "top" },
    ],
  }
  map.addTrace(trace)
  expect(map.connMap.areIdsConnected("trace", "old_port")).toBe(true)

  map.addTrace({
    ...trace,
    route: [
      {
        route_type: "wire",
        x: 2,
        y: 0,
        width: 0.2,
        layer: "top",
        start_pcb_port_id: "new_port",
      },
      { route_type: "wire", x: 3, y: 0, width: 0.2, layer: "top" },
    ],
  })
  expect(map.connMap.areIdsConnected("trace", "old_port")).toBe(false)
  expect(map.connMap.areIdsConnected("trace", "new_port")).toBe(true)
  expect(map.getAllTracesConnectedToPort("old_port")).toEqual([])
})
