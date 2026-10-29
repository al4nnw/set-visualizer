/**
 * Messages between the analysis threads (see index.ts): the page, the segment workers that run the
 * analysis, and for compressed files one decoder worker that feeds them.
 */
import type { PackedSpectrum, SegmentAnalysis, SegmentRange } from '@shared/analysis'
import type { PcmLayout } from '@shared/pcm'
import type { CompressedInfo } from './decode'

export type Song = { title: string; artist: string }
export type Takeover = { start: number; audibleAt: number; tailEnd: number } | null

/** Page → segment worker. */
export type WorkerJob =
  /** Analyse seconds of a WAV/AIFF file, read straight from it. */
  | { type: 'pcm'; id: number; file: Blob; layout: PcmLayout; range: SegmentRange }
  /** Take segments from the decoder over this port. */
  | { type: 'feed'; port: MessagePort }
  | { type: 'takeovers'; id: number; spectrum: PackedSpectrum; cues: number[]; duration: number; songs?: Song[] }

/** Decoder → segment worker, over the port. */
export type FeedMessage =
  | { type: 'begin'; id: number; range: SegmentRange; sampleRate: number }
  | { type: 'chunk'; id: number; at: number; samples: Float32Array }
  | { type: 'end'; id: number; atEnd: boolean }

/** Segment worker → decoder, over the port: ready for the next segment. */
export type FeedReply = { type: 'free' }

/** Segment worker → page. */
export type WorkerReply =
  | { type: 'progress'; id: number; seconds: number }
  | { type: 'segment'; id: number; result: SegmentAnalysis }
  | { type: 'takeovers'; id: number; result: Takeover[] }
  | { type: 'error'; id: number; message: string }

/** Page → decoder. */
export type DecoderJob = { type: 'open'; file: Blob } | { type: 'run'; ports: MessagePort[]; segmentLength: number }

/** Decoder → page. */
export type DecoderReply =
  | { type: 'info'; info: CompressedInfo }
  /** Segment `id` covers `range` (its result comes from the worker it went to). */
  | { type: 'segment'; id: number; range: SegmentRange }
  /** Decoding finished: `segments` segments in all. */
  | { type: 'decoded'; frames: number; sampleRate: number; segments: number }
  | { type: 'error'; reason?: 'format' | 'noAudio' | 'codec'; codec?: string; message: string }
