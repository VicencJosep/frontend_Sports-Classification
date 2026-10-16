#!/usr/bin/env node
/**
 * build-fixtures.mjs
 * ==================
 * Builds the mock fixtures served from `public/mock/` out of REAL outputs of the
 * Sports-Classification Python project. The Python project is only read.
 *
 * Each fixture "part" is a short excerpt of a full-match analysis run:
 *   - the source video is re-encoded to a browser-playable H.264 slice
 *     (the pipeline's own `final.mp4` is MPEG-4 Part 2 and does not play in browsers);
 *   - the Python JSON files (tracks, teams, telemetry) are sliced to the same
 *     window and re-based so the excerpt starts at frame 0 / 0 s;
 *   - `possessor_tracker_id` from the possession cache is merged into each
 *     tracking record (same key name the Python `possession.jsonl` uses).
 *
 * The JSON keeps the exact Python key names and shapes, so the frontend
 * adapters are exercised on real data. Match metadata (name, teams, date,
 * status) is frontend-owned demo data: the Python project has no such fields.
 *
 * Usage:
 *   node scripts/build-fixtures.mjs             # build what is missing
 *   node scripts/build-fixtures.mjs --force     # rebuild everything (re-encodes video)
 *   node scripts/build-fixtures.mjs --skip-video
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = new Set(process.argv.slice(2));
const FORCE = argv.has('--force');
const SKIP_VIDEO = argv.has('--skip-video');

const config = JSON.parse(await fs.readFile(path.join(here, 'fixtures.config.json'), 'utf8'));
const pyRoot = path.resolve(root, config.pythonProjectDir);
const outRoot = path.join(root, 'public', 'mock', 'matches');
const ff = { crf: 23, preset: 'medium', audioBitrate: '96k', ...(config.ffmpeg ?? {}) };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const round3 = (x) => Math.round(x * 1000) / 1000;
const exists = (p) => fs.access(p).then(() => true, () => false);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}\n${err.slice(-2000)}`)),
    );
  });
}

async function probeVideo(file) {
  const out = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration,start_time',
    '-of', 'json', file,
  ]);
  const s = JSON.parse(out).streams[0];
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return {
    width: s.width,
    height: s.height,
    fps: num / (den || 1),
    frameCount: Number(s.nb_frames),
    durationS: Number(s.duration),
    startTimeS: Number(s.start_time ?? 0),
  };
}

const FRAME_RE = /"frame_idx":\s*(\d+)/;

/** Streams a frame-ordered JSONL file and yields only the records inside [startFrame, endFrame). */
async function* iterJsonlInRange(file, startFrame, endFrame) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const m = FRAME_RE.exec(line);
    if (!m) continue;
    const frame = Number(m[1]);
    if (frame < startFrame) continue;
    if (frame >= endFrame) break;
    yield JSON.parse(line);
  }
}

async function buildPart(match, part) {
  const partDir = path.join(outRoot, match.id, 'parts', part.id);
  await fs.mkdir(partDir, { recursive: true });

  const srcVideo = path.join(pyRoot, part.video);
  const probe = await probeVideo(srcVideo);
  const fps = probe.fps;
  const startFrame = Math.round(part.startS * fps);
  const nFrames = Math.round(part.durationS * fps);
  const endFrame = startFrame + nFrames;
  const t0 = startFrame / fps;
  const durationS = nFrames / fps;
  log(`[${match.id}/${part.id}] window ${t0}s..${t0 + durationS}s = frames ${startFrame}..${endFrame - 1} @ ${fps} fps`);

  // --- possession (optional): frame_idx -> possessor_tracker_id -------------
  const possessor = new Map();
  if (part.possession) {
    for await (const rec of iterJsonlInRange(path.join(pyRoot, part.possession), startFrame, endFrame)) {
      possessor.set(rec.frame_idx, rec.possessor_tracker_id ?? null);
    }
    log(`  possession: ${possessor.size} frames`);
  }

  // --- tracks ----------------------------------------------------------------
  const seenIds = new Set();
  const lines = [];
  for await (const rec of iterJsonlInRange(path.join(pyRoot, part.tracks), startFrame, endFrame)) {
    const out = {
      ...rec,
      frame_idx: rec.frame_idx - startFrame,
      timestamp_s: round3((rec.frame_idx - startFrame) / fps),
    };
    if (part.possession) out.possessor_tracker_id = possessor.has(rec.frame_idx) ? possessor.get(rec.frame_idx) : null;
    for (const t of rec.tracks ?? []) seenIds.add(t.tracker_id);
    lines.push(JSON.stringify(out));
  }
  if (lines.length !== nFrames) log(`  WARNING: ${lines.length} tracking records for ${nFrames} frames`);
  await fs.writeFile(path.join(partDir, 'tracks.jsonl'), lines.join('\n') + '\n');
  log(`  tracks: ${lines.length} records, ${seenIds.size} tracker ids`);

  // --- telemetry ---------------------------------------------------------------
  const telemetry = JSON.parse(await fs.readFile(path.join(pyRoot, part.telemetry), 'utf8'));
  const outTel = { ...telemetry, source_video: `${match.id}/parts/${part.id}/video.mp4` };
  if (Array.isArray(telemetry.events)) {
    outTel.events = telemetry.events
      .filter((e) => e.end_s > t0 && e.start_s < t0 + durationS)
      .map((e) => ({
        ...e,
        start_s: round3(Math.max(0, e.start_s - t0)),
        end_s: round3(Math.min(durationS, e.end_s - t0)),
      }));
  }
  outTel.ball_actions = (telemetry.ball_actions ?? [])
    .filter((a) => a.frame_idx >= startFrame && a.frame_idx < endFrame)
    .map((a) => ({ ...a, frame_idx: a.frame_idx - startFrame }));
  outTel.n_frames = lines.length;
  if ('n_possession_changes' in telemetry) outTel.n_possession_changes = outTel.ball_actions.length;
  await fs.writeFile(path.join(partDir, 'telemetry.json'), JSON.stringify(outTel, null, 2) + '\n');
  log(`  telemetry: ${outTel.events?.length ?? 0} events, ${outTel.ball_actions.length} ball actions`);

  // --- teams -------------------------------------------------------------------
  const teams = JSON.parse(await fs.readFile(path.join(pyRoot, part.teams), 'utf8'));
  const outTeams = {
    ...teams,
    source_video: `${match.id}/parts/${part.id}/video.mp4`,
    tracks_jsonl: 'tracks.jsonl',
    teams: teams.teams.filter((t) => seenIds.has(t.tracker_id)),
    excluded: teams.excluded.filter((t) => seenIds.has(t.tracker_id)),
    n_frames_processed: lines.length,
  };
  await fs.writeFile(path.join(partDir, 'teams.json'), JSON.stringify(outTeams, null, 2) + '\n');
  log(`  teams: ${outTeams.teams.length} assigned, ${outTeams.excluded.length} excluded`);

  // --- video -------------------------------------------------------------------
  const outVideo = path.join(partDir, 'video.mp4');
  if (!SKIP_VIDEO && (FORCE || !(await exists(outVideo)))) {
    log('  encoding video ...');
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', String(t0), '-i', srcVideo,
      '-t', String(durationS), '-frames:v', String(nFrames),
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', ff.preset, '-crf', String(ff.crf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', ff.audioBitrate,
      '-movflags', '+faststart',
      outVideo,
    ]);
  }
  let video = null;
  if (await exists(outVideo)) {
    const vp = await probeVideo(outVideo);
    if (vp.frameCount !== nFrames) log(`  WARNING: encoded ${vp.frameCount} frames, expected ${nFrames}`);
    video = { file: `parts/${part.id}/video.mp4`, ...vp };
    log(`  video: ${vp.width}x${vp.height} @ ${vp.fps} fps, ${vp.frameCount} frames, ${vp.durationS}s`);
  }

  return {
    id: part.id,
    kind: part.kind,
    label: part.label,
    mode: Array.isArray(telemetry.events) ? 'full-match' : 'clip',
    status: 'completed',
    video,
    files: {
      tracks: `parts/${part.id}/tracks.jsonl`,
      teams: `parts/${part.id}/teams.json`,
      telemetry: `parts/${part.id}/telemetry.json`,
    },
    sourceVideoPath: part.video,
    sourceWindow: { startS: t0, endS: round3(t0 + durationS) },
    stats: {
      frames: lines.length,
      events: outTel.events?.length ?? 0,
      ballActions: outTel.ball_actions.length,
      tracklets: seenIds.size,
      hasFieldCoordinates: lines.some((l) => l.includes('"field_xy"')),
      hasPossession: Boolean(part.possession),
    },
  };
}

async function buildMatch(match) {
  const parts = [];
  for (const part of match.parts) {
    if (part.video) {
      parts.push(await buildPart(match, part));
    } else {
      parts.push({
        id: part.id, kind: part.kind, label: part.label, mode: 'full-match',
        status: part.status ?? match.status, video: null, files: null,
        sourceVideoPath: null, sourceWindow: null, stats: null,
      });
    }
  }
  return {
    id: match.id,
    name: match.name,
    homeTeam: match.homeTeam ?? null,
    awayTeam: match.awayTeam ?? null,
    date: match.date ?? null,
    score: match.score ?? null,
    status: match.status,
    errorMessage: match.errorMessage ?? null,
    isDemo: Boolean(match.isDemo),
    note: match.note ?? null,
    createdAt: match.createdAt ?? `${match.date ?? '2026-01-01'}T12:00:00.000Z`,
    parts,
  };
}

await fs.mkdir(outRoot, { recursive: true });
const matches = [];
for (const match of config.matches) {
  log(`== ${match.name}`);
  matches.push(await buildMatch(match));
}
const index = { schemaVersion: 1, generatedAt: new Date().toISOString(), matches };
await fs.writeFile(path.join(outRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
log(`index written: ${path.relative(root, path.join(outRoot, 'index.json'))} (${matches.length} matches)`);
