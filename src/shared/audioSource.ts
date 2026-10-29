/**
 * Decoded audio as the browser analysis reads it: planar float chunks at known frame positions,
 * for any range of the file, so several threads can each decode their own piece of one set.
 */
export interface AudioSource {
  /** What decodes it (for messages and diagnostics): 'wav', 'aiff', or the codec. */
  kind: string
  sampleRate: number
  channels: number
  /** Length in sample frames (exact for PCM, from the container's duration otherwise). */
  frames: number
  duration: number
  /**
   * Decodes frames [from, to) and hands them over in order, one array per channel. Chunks are
   * contiguous and the first starts at `from` (or at 0 when from < 0); `at` is the first frame's
   * index. Stops early at the end of the file. A promise from onChunk is awaited.
   */
  read(from: number, to: number, onChunk: (planes: Float32Array[], at: number) => void | Promise<void>, signal?: AbortSignal): Promise<void>
}
