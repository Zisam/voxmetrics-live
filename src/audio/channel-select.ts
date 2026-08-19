export type ChannelSelection = "left" | "right";

/**
 * Pick the capture channel from a worklet input: stereo interfaces route
 * guitar to L and mic to R; mono devices fall back to their single channel.
 */
export function pickChannel(
  channels: Float32Array[] | undefined,
  selection: ChannelSelection,
): Float32Array | undefined {
  if (!channels || channels.length === 0) return undefined;
  if (selection === "right" && channels.length > 1) return channels[1]!;
  return channels[0]!;
}
