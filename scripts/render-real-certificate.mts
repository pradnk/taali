/**
 * Renders a real certificate end to end, outside the browser.
 *
 *   npm run sample:real -- <certificateId>
 *   npm run sample:real                     # uses the first certificate found
 *
 * Unlike `npm run sample`, which substitutes tones for the narration, this uses
 * the actual event wording, the actual voice and the actual backing tracks, and
 * writes an MP3 you can listen to. It is the closest thing to what the browser
 * produces without opening one.
 *
 * It deliberately does not write anything back to the database or upload
 * anything: it is a listening check, not a substitute for pressing "Make".
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { AudioBuffer, OfflineAudioContext } from 'node-web-audio-api';
import { Mp3Encoder } from '@breezystack/lamejs';

Object.assign(globalThis, { OfflineAudioContext, AudioBuffer });
config({ path: ['.env.local', '.env'], quiet: true });

const { renderCertificate } = await import('../src/lib/audio/mix.ts');
const { BEDS, SAMPLE_RATE } = await import('../src/lib/audio/score.ts');
const { buildScript } = await import('../src/lib/script.ts');
const { certificateFileBase } = await import('../src/lib/filename.ts');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = neon(process.env.DATABASE_URL!);

const wanted = process.argv[2];
const [row] = wanted
  ? await sql`SELECT c.*, row_to_json(e.*) AS event FROM certificates c
              JOIN events e ON e.id = c.event_id WHERE c.public_id = ${wanted} OR c.id::text = ${wanted}`
  : await sql`SELECT c.*, row_to_json(e.*) AS event FROM certificates c
              JOIN events e ON e.id = c.event_id ORDER BY c.created_at LIMIT 1`;

if (!row) throw new Error('No certificate found. Add one in the admin first.');

// Drizzle's camelCase fields, from the snake_case columns this raw query returns.
const certificate = {
  studentName: row.student_name,
  namePronunciation: row.name_pronunciation,
  school: row.school,
  city: row.city,
  className: row.class_name,
  projectTitle: row.project_title,
  projectBlurb: row.project_blurb,
  award: row.award,
  language: row.language,
};
const event = {
  name: row.event.name,
  orgName: row.event.org_name,
  eventDate: row.event.event_date,
  venue: row.event.venue,
  templates: row.event.templates,
  voiceId: row.event.voice_id,
  modelId: row.event.model_id,
  defaultLanguage: row.event.default_language,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw row, not a Drizzle model
const snapshot = buildScript(event as any, certificate as any);
console.log(`${certificate.studentName} — ${certificate.award}`);
console.log(`voice ${snapshot.voiceId}   model ${snapshot.modelId}   language ${snapshot.language}\n`);
for (const segment of snapshot.segments) {
  console.log(`  ${segment.id.padEnd(10)} ${segment.speed !== 1 ? `${segment.speed}x ` : '    '} ${segment.text}`);
}

async function synthesize(text: string, speed: number): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${snapshot.voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: snapshot.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          ...(snapshot.modelId === 'eleven_v3' ? {} : { speed }),
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.arrayBuffer();
}

const context = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SAMPLE_RATE });

console.log('\nsynthesising…');
const clips: Record<string, AudioBuffer> = {};
for (const segment of snapshot.segments) {
  const audio = await synthesize(segment.spoken, segment.speed);
  clips[segment.id] = await context.decodeAudioData(audio);
  console.log(`  ${segment.id.padEnd(10)} ${clips[segment.id].duration.toFixed(2)}s`);
}

function readWav(path: string): Float32Array {
  const bytes = readFileSync(path);
  let offset = 12;
  while (offset < bytes.length - 8) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'data') {
      const count = size / 2;
      const out = new Float32Array(count);
      for (let i = 0; i < count; i += 1) out[i] = bytes.readInt16LE(offset + 8 + i * 2) / 32768;
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No data chunk in ${path}`);
}

const beds = Object.fromEntries(
  (Object.keys(BEDS) as Array<keyof typeof BEDS>).map((bed) => {
    const samples = readWav(join(ROOT, 'public', BEDS[bed].src));
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate: SAMPLE_RATE });
    buffer.copyToChannel(new Float32Array(samples), 0);
    return [bed, buffer];
  }),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness
const mix = await renderCertificate(snapshot.segments as any, clips as any, beds as any);

const pcm = new Int16Array(mix.samples.length);
for (let i = 0; i < mix.samples.length; i += 1) {
  const clamped = Math.max(-1, Math.min(1, mix.samples[i]));
  pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}
const encoder = new Mp3Encoder(1, mix.sampleRate, 128);
const chunks: Buffer[] = [];
for (let offset = 0; offset < pcm.length; offset += 1152) {
  const encoded = encoder.encodeBuffer(pcm.subarray(offset, offset + 1152));
  if (encoded.length > 0) chunks.push(Buffer.from(encoded));
}
const tail = encoder.flush();
if (tail.length > 0) chunks.push(Buffer.from(tail));
const mp3 = Buffer.concat(chunks);

const name = `${certificateFileBase(event.name, certificate.studentName)}.mp3`;
writeFileSync(join(ROOT, name), mp3);

console.log(`\nduration  ${(mix.durationMs / 1000).toFixed(2)}s`);
console.log(`loudness  ${mix.measuredLufs.toFixed(1)} -> -16 LUFS (${mix.appliedGainDb >= 0 ? '+' : ''}${mix.appliedGainDb.toFixed(1)} dB)`);
console.log(`peak      ${(20 * Math.log10(mix.peak)).toFixed(2)} dBFS`);
console.log(`\nwrote ${name} (${(mp3.length / 1024).toFixed(0)} KB) — listen to it.`);
