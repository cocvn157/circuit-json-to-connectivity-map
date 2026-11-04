import type { LayerRef, PcbVia } from "circuit-json"

export const getViaSpanLayers = ({
  fromLayer,
  toLayer,
  layerCount,
}: {
  fromLayer: LayerRef
  toLayer: LayerRef
  layerCount: number
}): LayerRef[] => {
  if (fromLayer === toLayer) return [fromLayer]
  const stack: LayerRef[] = ["top"]
  for (let i = 1; i <= layerCount - 2; i++) {
    stack.push(`inner${i}` as LayerRef)
  }
  stack.push("bottom")
  const fromIndex = stack.indexOf(fromLayer)
  const toIndex = stack.indexOf(toLayer)
  if (fromIndex === -1 || toIndex === -1) return [fromLayer, toLayer]
  return fromIndex <= toIndex
    ? stack.slice(fromIndex, toIndex + 1)
    : stack.slice(toIndex, fromIndex + 1).reverse()
}

/** Expand the drill span, including intermediate layers omitted from `layers`.
 * Explicit drill endpoints take precedence over connected layer metadata.
 */
export const getPcbViaSpanLayers = (
  via: PcbVia,
  layerCount: number,
): LayerRef[] => {
  if (via.through_hole)
    return getViaSpanLayers({
      fromLayer: "top",
      toLayer: "bottom",
      layerCount,
    })

  const layerOrder = (layer: LayerRef) =>
    layer === "top"
      ? 0
      : layer === "bottom"
        ? Number.POSITIVE_INFINITY
        : Number(layer.slice(5))
  const layers = [...via.layers].sort((a, b) => layerOrder(a) - layerOrder(b))
  const fromLayer = via.topmost_drill_layer ?? via.from_layer ?? layers[0]
  const toLayer =
    via.bottommost_drill_layer ?? via.to_layer ?? layers[layers.length - 1]
  if (!fromLayer || !toLayer) return layers
  return getViaSpanLayers({ fromLayer, toLayer, layerCount })
}
