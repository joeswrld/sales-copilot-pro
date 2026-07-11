/**
 * pcm16-processor.js
 *
 * Runs on the audio render thread (not main thread) so frame packaging
 * never blocks on React renders or network calls — this is what keeps
 * mic → WebSocket latency low and jitter-free.
 *
 * Deepgram's live endpoint expects raw linear16 PCM at 16kHz mono. The
 * AudioContext that owns this worklet is created with `sampleRate: 16000`
 * (see useLiveTranscriptionSocket.ts), so no resampling happens here —
 * we just accumulate the 128-sample render quanta Web Audio hands us into
 * ~100ms frames, convert Float32 [-1,1] to Int16, and post the frame to
 * the main thread as a transferable ArrayBuffer (zero-copy).
 *
 * 100ms frames are a deliberate balance: small enough that a single frame
 * never meaningfully adds to perceived latency, large enough that we're
 * not flooding the WebSocket with a message every 128 samples (~8ms).
 */
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 16000 samples/sec * 0.1s = 1600 samples per frame
    this.frameSize = 1600;
    this.buffer = new Float32Array(this.frameSize);
    this.writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.writeIndex++] = channel[i];
      if (this.writeIndex >= this.frameSize) {
        this.flush();
      }
    }
    return true;
  }

  flush() {
    const pcm16 = new Int16Array(this.writeIndex);
    for (let i = 0; i < this.writeIndex; i++) {
      // Clamp then scale float [-1,1] to int16 range
      const s = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    this.writeIndex = 0;
  }
}

registerProcessor('pcm16-processor', PCM16Processor);
