import type { PCBTrace } from "circuit-json"
import type { CopperConductor } from "./PcbConnectivityMap"

/** Project physical components into the flat ID API without joining components.
 * An ID belonging to multiple components remains available in conductor metadata
 * but cannot name a single physical network. Endpoint references without copper
 * geometry are aliases only when they identify one unambiguous component.
 */
export const projectCopperConductorComponents = (
  components: CopperConductor[][],
  analyzedTraceIds: ReadonlySet<string>,
  traces: ReadonlyMap<string, PCBTrace>,
) => {
  const membership = new Map<string, Set<number>>()
  const addMembership = (id: string, component: number) => {
    let indices = membership.get(id)
    if (!indices) {
      indices = new Set()
      membership.set(id, indices)
    }
    indices.add(component)
  }
  for (const [index, conductors] of components.entries()) {
    for (const conductor of conductors) {
      for (const id of [
        ...(conductor.pcbPortIds ?? []),
        conductor.pourId,
        conductor.viaId,
        conductor.traceId,
      ]) {
        if (id) addMembership(id, index)
      }
    }
  }

  // Geometry takes precedence over endpoint metadata, even when an endpoint
  // incorrectly names a port on a different physical component.
  const physicalIds = new Set(membership.keys())
  const ownedIds = new Set([...physicalIds, ...analyzedTraceIds])
  for (const traceId of analyzedTraceIds) {
    const traceComponents = membership.get(traceId)
    const component =
      traceComponents?.size === 1 ? [...traceComponents][0] : undefined
    for (const point of traces.get(traceId)!.route) {
      if (point.route_type !== "wire") continue
      for (const id of [point.start_pcb_port_id, point.end_pcb_port_id]) {
        if (!id) continue
        // Also reserve unresolved aliases so legacy connectivity cannot join
        // copper groups through an ID omitted from the flat projection.
        ownedIds.add(id)
        if (component !== undefined && !physicalIds.has(id))
          addMembership(id, component)
      }
    }
  }

  const connections: string[][] = components.map(() => [])
  for (const [id, indices] of membership) {
    if (indices.size === 1) connections[[...indices][0]!]!.push(id)
  }
  return {
    connections: connections.filter((ids) => ids.length > 0),
    ownedIds,
  }
}
