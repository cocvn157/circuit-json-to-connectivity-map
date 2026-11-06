import type { AnyCircuitElement, PCBPort, PCBTrace } from "circuit-json"
import { ConnectivityMap } from "./ConnectivityMap"
import { doesLineIntersectLine } from "@tscircuit/math-utils"
import { findConnectedNetworks } from "./findConnectedNetworks"

/**
 * A PCB Connectivity Map is a connectivity map that has analyzed what traces and ports are actually connected on the
 * PCB.
 *
 * This is useful for determining how to route a trace on the PCB. For example, you may want to determine where the
 * nearest connected net point is to connect an unrouted pin.
 */
export class PcbConnectivityMap {
  circuitJson: AnyCircuitElement[]
  traceIdToElm: Map<string, PCBTrace>
  portIdToElm: Map<string, PCBPort>
  connMap: ConnectivityMap

  constructor(circuitJson?: AnyCircuitElement[]) {
    this.circuitJson = circuitJson || []
    this.traceIdToElm = new Map()
    this.portIdToElm = new Map()
    if (circuitJson) {
      this._buildTraceMap()
      this._buildPortMap()
      this.connMap = this._buildTraceConnectivityMap()
    } else {
      this.connMap = new ConnectivityMap({})
    }
  }

  private _buildPortMap() {
    for (const element of this.circuitJson) {
      if (element.type === "pcb_port") {
        this.portIdToElm.set(element.pcb_port_id, element as PCBPort)
      }
    }
  }

  private _buildTraceMap() {
    for (const element of this.circuitJson) {
      if (element.type === "pcb_trace") {
        this.traceIdToElm.set(element.pcb_trace_id, element as PCBTrace)
      }
    }
  }

  private _buildTraceConnectivityMap(): ConnectivityMap {
    const connections: string[][] = []
    const traceIds = Array.from(this.traceIdToElm.keys())

    for (let i = 0; i < traceIds.length; i++) {
      for (let j = i + 1; j < traceIds.length; j++) {
        const trace1 = this.traceIdToElm.get(traceIds[i])!
        const trace2 = this.traceIdToElm.get(traceIds[j])!
        if (this._arePcbTracesConnected(trace1, trace2)) {
          connections.push([traceIds[i], traceIds[j]])
        }
      }
    }

    for (const port of this.portIdToElm.values()) {
      for (const trace of this.traceIdToElm.values()) {
        for (const rp of trace.route) {
          if (rp.route_type === "wire") {
            if (rp.start_pcb_port_id === port.pcb_port_id) {
              connections.push([port.pcb_port_id, trace.pcb_trace_id])
            } else if (rp.end_pcb_port_id === port.pcb_port_id) {
              connections.push([trace.pcb_trace_id, port.pcb_port_id])
            }
          }
        }
      }
    }

    return new ConnectivityMap(findConnectedNetworks(connections))
  }

  addTrace(trace: PCBTrace) {
    const connections: string[][] = []
    for (const [
      existingTraceId,
      existingTrace,
    ] of this.traceIdToElm.entries()) {
      if (
        existingTraceId !== trace.pcb_trace_id &&
        this._arePcbTracesConnected(existingTrace, trace)
      ) {
        connections.push([existingTraceId, trace.pcb_trace_id])
      }
    }
    this.traceIdToElm.set(trace.pcb_trace_id, trace)
    for (const rp of trace.route) {
      if (rp.route_type === "wire") {
        if (rp.start_pcb_port_id) {
          connections.push([rp.start_pcb_port_id, trace.pcb_trace_id])
        }
        if (rp.end_pcb_port_id) {
          connections.push([rp.end_pcb_port_id, trace.pcb_trace_id])
        }
      }
    }

    this.connMap.addConnections(connections)
  }

  _arePcbTracesConnected(trace1: PCBTrace, trace2: PCBTrace): boolean {
    for (let i = 0; i < trace1.route.length - 1; i++) {
      const segment1A = trace1.route[i]
      const segment1B = trace1.route[i + 1]
      if (segment1A.route_type !== "wire") continue
      if (segment1B.route_type !== "wire") continue
      if (segment1A.layer !== segment1B.layer) continue
      const minX = Math.min(segment1A.x, segment1B.x)
      const minY = Math.min(segment1A.y, segment1B.y)
      const maxX = Math.max(segment1A.x, segment1B.x)
      const maxY = Math.max(segment1A.y, segment1B.y)
      const finiteBounds =
        Number.isFinite(minX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxX) &&
        Number.isFinite(maxY)
      for (let j = 0; j < trace2.route.length - 1; j++) {
        const segment2A = trace2.route[j]
        const segment2B = trace2.route[j + 1]

        if (segment2A.route_type !== "wire") continue
        if (segment2B.route_type !== "wire") continue
        if (segment2A.layer !== segment2B.layer) continue
        if (segment1A.layer !== segment2A.layer) continue

        // Reject distant pairs before the unchanged continuous predicate.
        const lineThickness = (segment1A.width + segment2A.width) / 2
        const expansion = Math.max(0, lineThickness) + 1e-9
        if (
          finiteBounds &&
          Number.isFinite(segment2A.x) &&
          Number.isFinite(segment2A.y) &&
          Number.isFinite(segment2B.x) &&
          Number.isFinite(segment2B.y) &&
          Number.isFinite(lineThickness) &&
          (Math.min(segment2A.x, segment2B.x) > maxX + expansion ||
            Math.max(segment2A.x, segment2B.x) < minX - expansion ||
            Math.min(segment2A.y, segment2B.y) > maxY + expansion ||
            Math.max(segment2A.y, segment2B.y) < minY - expansion)
        )
          continue

        // Check if lines are overlapping
        const isOverlapping = doesLineIntersectLine(
          [segment1A, segment1B],
          [segment2A, segment2B],
          {
            lineThickness,
          },
        )
        if (isOverlapping) {
          return true
        }
      }
    }
    return false
  }

  areTracesConnected(traceId1: string, traceId2: string): boolean {
    return this.connMap.areIdsConnected(traceId1, traceId2)
  }

  getAllTracesConnectedToTrace(traceId: string): PCBTrace[] {
    const netId = this.connMap.getNetConnectedToId(traceId)
    return netId
      ? this.connMap
          .getIdsConnectedToNet(netId)
          .filter((id) => this.traceIdToElm.has(id))
          .map((id) => this.traceIdToElm.get(id) as PCBTrace)
      : []
  }

  getAllTracesConnectedToPort(portId: string): PCBTrace[] {
    const netId = this.connMap.getNetConnectedToId(portId)
    return netId
      ? this.connMap
          .getIdsConnectedToNet(netId)
          .filter((id) => this.traceIdToElm.has(id))
          .map((id) => this.traceIdToElm.get(id) as PCBTrace)
      : []
  }
}
