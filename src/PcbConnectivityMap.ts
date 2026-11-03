import type { Polygon } from "@flatten-js/core"
import type {
  AnyCircuitElement,
  PCBPort,
  PCBTrace,
  LayerRef,
  PcbTraceRoutePoint,
} from "circuit-json"
import Flatbush from "flatbush"
import {
  copperPolygonsTouch,
  getPlatedHolePolygon,
  getPourPolygon,
  getSmtPadPolygon,
  getTraceSegmentPolygon,
  getViaPolygon,
} from "@tscircuit/circuit-json-util"
import { getFullConnectivityMapFromCircuitJson } from "./getFullConnectivityMapFromCircuitJson"
import { getPcbViaSpanLayers, getViaSpanLayers } from "./getViaSpanLayers"
import { getWireSegmentPolygon } from "./getWireSegmentPolygon"
import { ConnectivityMap } from "./ConnectivityMap"
import { doesLineIntersectLine } from "@tscircuit/math-utils"
import { findConnectedNetworks } from "./findConnectedNetworks"

// Match the pour solver's coordinate scale. Flatten's internal epsilon must
// not collapse the sub-micron edges emitted by polygon clipping into points.
const GEOMETRY_SCALE = 1e6
const CONTACT_TOLERANCE = 1e-7 * GEOMETRY_SCALE

export interface CopperConductor {
  layers: LayerRef[]
  netId: string
  isTerminal: boolean
  pourId?: string
  pcbPortIds?: string[]
  viaId?: string
  traceId?: string
}

interface CopperConductorGeometry extends CopperConductor {
  polygon: Polygon
}

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
  private copperConductorComponents?: CopperConductorGeometry[][]

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
    const { connections: copperConnections, disconnectedTraceIds } =
      this._getCopperConnectivity()
    const traceIds = Array.from(this.traceIdToElm.keys()).filter(
      (id) => !disconnectedTraceIds.has(id),
    )

    for (let i = 0; i < traceIds.length; i++) {
      for (let j = i + 1; j < traceIds.length; j++) {
        const trace1 = this.traceIdToElm.get(traceIds[i])!
        const trace2 = this.traceIdToElm.get(traceIds[j])!
        if (this._arePcbTracesConnected(trace1, trace2)) {
          connections.push([traceIds[i], traceIds[j]])
        }
      }
    }

    for (const traceId of traceIds) {
      const trace = this.traceIdToElm.get(traceId)!
      for (const rp of trace.route) {
        if (rp.route_type === "wire") {
          if (rp.start_pcb_port_id) {
            connections.push([rp.start_pcb_port_id, traceId])
          }
          if (rp.end_pcb_port_id) {
            connections.push([traceId, rp.end_pcb_port_id])
          }
        }
      }
    }

    connections.push(...copperConnections)
    return new ConnectivityMap(findConnectedNetworks(connections))
  }

  addTrace(trace: PCBTrace) {
    const isReplacement = this.traceIdToElm.has(trace.pcb_trace_id)
    this.traceIdToElm.set(trace.pcb_trace_id, trace)
    this.circuitJson = [
      ...this.circuitJson.filter(
        (element) =>
          element.type !== "pcb_trace" ||
          element.pcb_trace_id !== trace.pcb_trace_id,
      ),
      trace,
    ]
    this.copperConductorComponents = undefined
    if (isReplacement) {
      this.connMap = this._buildTraceConnectivityMap()
      return
    }

    const { connections: copperConnections, disconnectedTraceIds } =
      this._getCopperConnectivity()
    const connections: string[][] = []
    if (!disconnectedTraceIds.has(trace.pcb_trace_id)) {
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
    }

    this.connMap.addConnections([...connections, ...copperConnections])
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

        // The legacy constant-width predicate cannot represent explicit tapers.
        if (
          segment1A.width_interpolation_mode ||
          segment2A.width_interpolation_mode
        ) {
          const polygon1 = getWireSegmentPolygon(
            segment1A,
            segment1B,
            trace1.route_thickness_mode === "interpolated"
              ? segment1B.width
              : segment1A.width,
          ).scale(GEOMETRY_SCALE, GEOMETRY_SCALE)
          const polygon2 = getWireSegmentPolygon(
            segment2A,
            segment2B,
            trace2.route_thickness_mode === "interpolated"
              ? segment2B.width
              : segment2A.width,
          ).scale(GEOMETRY_SCALE, GEOMETRY_SCALE)
          if (copperPolygonsTouch(polygon1, polygon2, CONTACT_TOLERANCE))
            return true
          continue
        }

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

  /** Same-net copper groups, including pour, via, and terminal IDs.
   * Polygon geometry remains internal. Generated stitching vias still conduct
   * copper, but callers can exclude them from authored terminal anchors.
   */
  getCopperConductorComponents(
    generatedStitchingViaIds: ReadonlySet<string> = new Set(),
  ): CopperConductor[][] {
    this.copperConductorComponents ??= this._buildCopperConductorComponents()
    return this.copperConductorComponents.map((conductors) =>
      conductors.map(({ polygon, ...conductor }) => ({
        ...conductor,
        isTerminal:
          conductor.isTerminal &&
          !(conductor.viaId && generatedStitchingViaIds.has(conductor.viaId)),
      })),
    )
  }

  private _getCopperConnectivity() {
    const components = this.getCopperConductorComponents()
    const seenTraceIds = new Set<string>()
    const disconnectedTraceIds = new Set<string>()
    for (const conductors of components) {
      const traceIds = new Set(
        conductors.flatMap((c) => (c.traceId ? [c.traceId] : [])),
      )
      for (const traceId of traceIds) {
        if (seenTraceIds.has(traceId)) disconnectedTraceIds.add(traceId)
        seenTraceIds.add(traceId)
      }
    }
    const connections = components
      .map((conductors) =>
        conductors.flatMap((conductor) => [
          ...(conductor.pcbPortIds ?? []),
          ...(conductor.pourId ? [conductor.pourId] : []),
          ...(conductor.viaId ? [conductor.viaId] : []),
          ...(conductor.traceId && !disconnectedTraceIds.has(conductor.traceId)
            ? [conductor.traceId]
            : []),
        ]),
      )
      .filter((ids) => ids.length > 0)
    return { connections, disconnectedTraceIds }
  }

  /** Physical contacts use board-world points in mm (+X right, +Y up,
   * +Z toward top, right-handed), scaled internally for robust predicates.
   * Net membership only permits a contact; it never creates a physical edge.
   * Trace segments remain separate, and only plated barrels bridge layers.
   */
  private _buildCopperConductorComponents(): CopperConductorGeometry[][] {
    const circuitJson = this.circuitJson
    const pours = circuitJson.filter((e) => e.type === "pcb_copper_pour")
    if (pours.length === 0) return []
    const connectivity = getFullConnectivityMapFromCircuitJson(circuitJson)
    const pouredNets = new Set(
      pours.flatMap((pour) =>
        pour.source_net_id
          ? [
              connectivity.getNetConnectedToId(pour.source_net_id) ??
                pour.source_net_id,
            ]
          : [],
      ),
    )
    const conductors: CopperConductorGeometry[] = []
    const add = (conductor: CopperConductorGeometry) => {
      if (pouredNets.has(conductor.netId) && !conductor.polygon.isEmpty())
        conductors.push({
          ...conductor,
          polygon: conductor.polygon.scale(GEOMETRY_SCALE, GEOMETRY_SCALE),
        })
    }
    const components = new Map(
      circuitJson
        .filter((e) => e.type === "pcb_component")
        .map((e) => [e.pcb_component_id, e]),
    )
    const vias = circuitJson.filter((e) => e.type === "pcb_via")
    const board = circuitJson.find((e) => e.type === "pcb_board")
    const viaLayers = new Map(
      vias.map((via) => [
        via.pcb_via_id,
        getPcbViaSpanLayers(via, board?.num_layers ?? 2),
      ]),
    )

    for (const pour of pours) {
      if (!pour.source_net_id) continue // Unassigned decorative copper has no target net to validate.
      add({
        polygon: getPourPolygon(pour),
        layers: [pour.layer],
        netId:
          connectivity.getNetConnectedToId(pour.source_net_id) ??
          pour.source_net_id,
        isTerminal: false,
        pourId: pour.pcb_copper_pour_id,
      })
    }
    for (const element of circuitJson) {
      if (element.type === "pcb_smtpad") {
        const netId = connectivity.getNetConnectedToId(element.pcb_smtpad_id)
        if (netId && pouredNets.has(netId))
          add({
            polygon: getSmtPadPolygon(element),
            layers: [element.layer],
            netId,
            isTerminal: !!element.pcb_port_id,
            pcbPortIds: element.pcb_port_id ? [element.pcb_port_id] : [],
          })
      } else if (element.type === "pcb_plated_hole") {
        const netId = connectivity.getNetConnectedToId(
          element.pcb_plated_hole_id,
        )
        if (netId && pouredNets.has(netId))
          add({
            polygon: getPlatedHolePolygon(
              element,
              element.pcb_component_id
                ? components.get(element.pcb_component_id)?.rotation
                : 0,
            ),
            layers: element.layers,
            netId,
            isTerminal: !!element.pcb_port_id,
            pcbPortIds: element.pcb_port_id ? [element.pcb_port_id] : [],
          })
      } else if (element.type === "pcb_via") {
        const netId = connectivity.getNetConnectedToId(element.pcb_via_id)
        if (netId && pouredNets.has(netId))
          add({
            polygon: getViaPolygon(
              element,
              element.outer_diameter,
              element.hole_diameter,
            ),
            layers: viaLayers.get(element.pcb_via_id)!,
            netId,
            isTerminal: true,
            viaId: element.pcb_via_id,
            pcbPortIds: element.pcb_port_ids,
          })
      } else if (element.type === "pcb_trace") {
        const netId = connectivity.getNetConnectedToId(element.pcb_trace_id)
        if (!netId || !pouredNets.has(netId)) continue
        for (let i = 0; i < element.route.length; i++) {
          const routePoint = element.route[i]!
          if (routePoint.route_type === "via") {
            const actualVia = vias.find(
              (via) =>
                via.x === routePoint.x &&
                via.y === routePoint.y &&
                viaLayers
                  .get(via.pcb_via_id)!
                  .includes(routePoint.from_layer) &&
                viaLayers.get(via.pcb_via_id)!.includes(routePoint.to_layer),
            )
            add({
              polygon: getViaPolygon(
                routePoint,
                actualVia?.outer_diameter ??
                  routePoint.outer_diameter ??
                  board?.min_via_pad_diameter ??
                  0.3,
                actualVia?.hole_diameter ??
                  routePoint.hole_diameter ??
                  board?.min_via_hole_diameter ??
                  0.2,
              ),
              layers:
                (actualVia ? viaLayers.get(actualVia.pcb_via_id) : undefined) ??
                getViaSpanLayers({
                  fromLayer: routePoint.from_layer,
                  toLayer: routePoint.to_layer,
                  layerCount: board?.num_layers ?? 2,
                }),
              netId,
              isTerminal: false,
              traceId: element.pcb_trace_id,
            })
          }
          const next = element.route[i + 1]
          if (!next) continue
          const start = this._getRouteEndpoint(routePoint, "end")
          const end = this._getRouteEndpoint(next, "start")
          if (start.layer !== end.layer) continue
          const startWidth =
            routePoint.route_type === "via"
              ? next.route_type === "via"
                ? undefined
                : next.width
              : routePoint.width
          if (startWidth === undefined) continue
          const endWidth =
            element.route_thickness_mode === "interpolated" &&
            next.route_type !== "via"
              ? next.width
              : startWidth
          add({
            polygon:
              routePoint.route_type === "wire"
                ? getWireSegmentPolygon(routePoint, end.point, endWidth)
                : getTraceSegmentPolygon(
                    start.point,
                    end.point,
                    startWidth,
                    endWidth,
                  ),
            layers: [start.layer],
            netId,
            isTerminal: false,
            traceId: element.pcb_trace_id,
          })
        }
      }
    }

    if (conductors.length === 0) return []
    const parent = conductors.map((_, i) => i)
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]!]!
        i = parent[i]!
      }
      return i
    }
    const bounds = conductors.map((conductor) => conductor.polygon.box)
    const spatialIndex = new Flatbush(conductors.length)
    for (const box of bounds)
      spatialIndex.add(box.xmin, box.ymin, box.xmax, box.ymax)
    spatialIndex.finish()
    for (const [i, conductor] of conductors.entries()) {
      const box = bounds[i]!
      for (const j of spatialIndex.search(
        box.xmin - CONTACT_TOLERANCE,
        box.ymin - CONTACT_TOLERANCE,
        box.xmax + CONTACT_TOLERANCE,
        box.ymax + CONTACT_TOLERANCE,
      )) {
        if (j <= i || find(i) === find(j)) continue
        const neighbor = conductors[j]!
        if (
          conductor.netId !== neighbor.netId ||
          !conductor.layers.some((layer) => neighbor.layers.includes(layer))
        )
          continue
        if (
          copperPolygonsTouch(
            conductor.polygon,
            neighbor.polygon,
            CONTACT_TOLERANCE,
          )
        )
          parent[find(j)] = find(i)
      }
    }
    const conductorsByRoot = new Map<number, CopperConductorGeometry[]>()
    for (const [index, conductor] of conductors.entries()) {
      const root = find(index)
      const connectedConductors = conductorsByRoot.get(root)
      if (connectedConductors) connectedConductors.push(conductor)
      else conductorsByRoot.set(root, [conductor])
    }
    return [...conductorsByRoot.values()]
  }

  private _getRouteEndpoint(
    routePoint: PcbTraceRoutePoint,
    side: "start" | "end",
  ) {
    if (routePoint.route_type === "wire")
      return { point: routePoint, layer: routePoint.layer }
    if (routePoint.route_type === "via")
      return {
        point: routePoint,
        layer: side === "start" ? routePoint.from_layer : routePoint.to_layer,
      }
    return {
      point: routePoint[side],
      layer: side === "start" ? routePoint.start_layer : routePoint.end_layer,
    }
  }
}
