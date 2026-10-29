/**
 * Messages between the analysis threads (see index.ts): the page, the segment workers that run the
 * analysis, and for compressed files one decoder worker that feeds them.
 */
import type { PackedSpectrum, SegmentAnalysis, SegmentRange } from '@shared/analysis'
import type { PcmLayout } from '@shared/pcm'
import type { CompressedInfo, PacketDecoding } from './decode'

export type Song = { title: string; artist: string }
export type Takeover = { start: number; audibleAt: number; tailEnd: number } | null

/** Page → segment worker. */
export type WorkerJob =
  /** Analyse seconds of a WAV/AIFF file, read straight from it. */
  | { type: 'pcm'; id: number; file: Blob; layout: PcmLayout; range: SegmentRange }
  /** Take segments from the decoder over this port. */
  | { type: 'feed'; port: MessagePort }
  | { type: 'takeovers'; id: number; spectrum: PackedSpectrum; cues: number[]; duration: number; songs?: Song[] }

/**
 * Decoder → segment worker, over the port: a segment's decoded audio (begin, chunks, end), or for
 * codecs that decode the same from mid-file, its packets to decode there (packet i is
 * data[offsets[i], offsets[i + 1]); the first ones only warm the decoder up).
 */
export type FeedMessage =
  | { type: 'begin'; id: number; range: SegmentRange; sampleRate: number }
  | { type: 'chunk'; id: number; at: number; samples: Float32Array }
  | { type: 'end'; id: number; atEnd: boolean }
  | {
      type: 'decode'
      id: number
      range: SegmentRange
      decoding: PacketDecoding
      /** The file ends in this segment. */
      atEnd: boolean
      data: Uint8Array
      offsets: Uint32Array
      timestamps: Float64Array
      durations: Float64Array
    }

/** Segment worker → decoder, over the port: ready for the next segment. */
export type FeedReply = { type: 'free' }

/** Segment worker → page. */
export type WorkerReply =
  | { type: 'progress'; id: number; seconds: number }
  | { type: 'segment'; id: number; result: SegmentAnalysis }
  | { type: 'takeovers'; id: number; result: Takeover[] }
  | { type: 'error'; id: number; message: string }

/** Page → decoder. */
export type DecoderJob =
  | { type: 'open'; file: Blob }
  /** inOrder: decode on this thread even where the segment workers could decode their own. */
  | { type: 'run'; ports: MessagePort[]; segmentLength: number; inOrder?: boolean }

/** Decoder → page. */
export type DecoderReply =
  | { type: 'info'; info: CompressedInfo }
  /** Segment `id` covers `range` (its result comes from the worker it went to). */
  | { type: 'segment'; id: number; range: SegmentRange }
  /** Decoding finished: `segments` segments in all. */
  | { type: 'decoded'; frames: number; sampleRate: number; segments: number }
  | { type: 'error'; reason?: 'format' | 'noAudio' | 'codec'; codec?: string; message: string }
