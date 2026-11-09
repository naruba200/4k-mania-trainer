// Community chart import: StepMania (.sm / .ssc), osu!mania (.osu) and
// osu! beatmap sets (.osz — a zip of .osu files plus audio/images).
// All parsers target 4-key charts and return the app's internal chart shape:
//   { name, notes: [{ t (ms), c (0-3), h (hold ms|null) }] }
// Anything the trainer can't represent (warps, mines, >4 keys) is skipped
// rather than failing the whole import.

const LANES = 4;

// ---------- StepMania (.sm / .ssc) ----------

// #TAG:value; pairs. Values may span lines; the first ';' ends the tag.
const parseTags = (text) => {
  const tags = {};
  const re = /#([A-Z]+):([\s\S]*?);/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tags[m[1]] = m[2].trim();
  }
  return tags;
};

// "0.000=150.000,32.000=160.500" -> [{ beat, bpm }] sorted by beat.
const parseBpms = (raw) => {
  const segs = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [b, bpm] = s.split('=').map(Number);
      return { beat: b, bpm };
    })
    .filter((s) => Number.isFinite(s.beat) && Number.isFinite(s.bpm) && s.bpm > 0)
    .sort((a, b) => a.beat - b.beat);
  return segs.length > 0 ? segs : [{ beat: 0, bpm: 120 }];
};

// Beats -> seconds, walking the BPM segments.
const makeBeatToSec = (segs, offsetSec) => {
  return (beat) => {
    let sec = -offsetSec;
    let prevBeat = 0;
    let prevBps = segs[0].bpm / 60;
    for (let i = 1; i < segs.length; i++) {
      const segBeat = segs[i].beat;
      if (beat < segBeat) break;
      sec += (segBeat - prevBeat) / prevBps;
      prevBeat = segBeat;
      prevBps = segs[i].bpm / 60;
    }
    sec += (beat - prevBeat) / prevBps;
    return sec;
  };
};

const parseSM = (text, fallbackName) => {
  const tags = parseTags(text);
  const title = tags.TITLE || fallbackName;
  const beatToSec = makeBeatToSec(
    parseBpms(tags.BPMS),
    parseFloat(tags.OFFSET) || 0
  );

  // #NOTES blocks: type : charter : difficulty : meter : groove : note data
  const notesBlocks = [];
  const re = /#NOTES:([\s\S]*?);/g;
  let m;
  while ((m = re.exec(text)) !== null) notesBlocks.push(m[1]);

  for (const block of notesBlocks) {
    const parts = block.split(':');
    if (parts.length < 6) continue;
    const stepType = parts[0].trim();
    if (!/dance-single/i.test(stepType)) continue;
    const data = parts.slice(5).join(':').trim();
    const measures = data
      .split(',')
      .map((mes) => mes.split('\n').map((l) => l.trim()).filter((l) => l.length > 0));
    if (measures.length === 0) continue;
    const cols = measures[0][0]?.length;
    if (cols !== LANES) continue; // not a 4-key chart

    const notes = [];
    const holdHeads = {}; // column -> { beat }
    measures.forEach((rows, mi) => {
      const per = rows.length;
      rows.forEach((row, ri) => {
        const beat = mi * 4 + (ri / per) * 4;
        for (let c = 0; c < LANES; c++) {
          const ch = row[c];
          const time = Math.round(beatToSec(beat) * 1000);
          if (ch === '1' || ch === '4') {
            notes.push({ t: time, c, h: null });
          } else if (ch === '2') {
            holdHeads[c] = { beat, time };
          } else if (ch === '3' && holdHeads[c]) {
            const head = holdHeads[c];
            delete holdHeads[c];
            notes.push({ t: head.time, c, h: time - head.time });
          }
          // 'M' (mine) and anything else: skipped.
        }
      });
    });
    // Unclosed hold heads become taps.
    for (const [c, head] of Object.entries(holdHeads)) {
      notes.push({ t: head.time, c: Number(c), h: null });
    }
    notes.sort((a, b) => a.t - b.t || a.c - b.c);
    if (notes.length > 0) return { name: title, notes };
  }
  return null;
};

// ---------- osu!mania (.osu) ----------

// Parses one .osu file. Returns null unless it is an osu!mania chart with
// notes. Extra fields (mode, circleSize, title, version) let the .osz
// picker filter to 4K difficulties; a missing CircleSize (old/loose files)
// is reported as null and does not reject a single-file import.
const parseOsu = (text, fallbackName) => {
  const lines = text.split('\n').map((l) => l.trim());
  let mode = null;
  let circleSize = null;
  let title = fallbackName;
  let version = '';
  let inObjects = false;
  let inDifficulty = false;
  let inMetadata = false;
  const notes = [];
  const holdEnds = {}; // "col@time" -> 1 (dedup)

  for (const line of lines) {
    if (line.startsWith('[')) {
      inObjects = line === '[HitObjects]';
      inDifficulty = line === '[Difficulty]';
      inMetadata = line === '[Metadata]';
      continue;
    }
    if (!inObjects) {
      if (line.startsWith('Mode:')) mode = parseInt(line.slice(5), 10);
      else if (inMetadata && line.startsWith('Title:'))
        title = line.slice(6).trim() || fallbackName;
      else if (inMetadata && line.startsWith('Version:'))
        version = line.slice(8).trim();
      else if (inDifficulty && line.startsWith('CircleSize:'))
        circleSize = parseFloat(line.slice(11));
      continue;
    }
    if (!line) continue;
    const p = line.split(',');
    if (p.length < 5) continue;
    const x = parseFloat(p[0]);
    const time = parseInt(p[2], 10);
    const type = parseInt(p[3], 10);
    if (!Number.isFinite(x) || !Number.isFinite(time) || time < 0) continue;
    const column = Math.min(LANES - 1, Math.max(0, Math.floor((x * LANES) / 512)));
    if (type & 128) {
      // Hold: end time is the first field of objectParams.
      const endTime = parseInt(String(p[5] || '').split(':')[0], 10);
      if (Number.isFinite(endTime) && endTime > time) {
        notes.push({ t: time, c: column, h: endTime - time });
      } else {
        notes.push({ t: time, c: column, h: null });
      }
    } else {
      const key = `${column}@${time}`;
      if (holdEnds[key]) continue;
      holdEnds[key] = 1;
      notes.push({ t: time, c: column, h: null });
    }
  }
  if (mode !== 3 || notes.length === 0) return null;
  notes.sort((a, b) => a.t - b.t || a.c - b.c);
  return { name: title, title, version, mode, circleSize, notes };
};

// ---------- osu! beatmap set (.osz) ----------

// Unzips a .osz (a zip) and returns one candidate per 4K mania difficulty:
//   [{ name: "Title [Version]", title, version, notes, noteCount }]
// Only .osu entries are read — audio, images and video are never touched.
// Non-mania modes and non-4K CircleSize values are skipped. Returns [] when
// nothing qualifies (or the file isn't a valid zip).
export const parseOszFile = async (file) => {
  let JSZip;
  try {
    ({ default: JSZip } = await import('jszip'));
  } catch {
    return [];
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return [];
  }
  const candidates = [];
  const entries = Object.values(zip.files || {}).filter(
    (e) => !e.dir && /\.osu$/i.test(e.name)
  );
  for (const entry of entries) {
    let text;
    try {
      text = await entry.async('string');
    } catch {
      continue;
    }
    const base = entry.name.split('/').pop().replace(/\.osu$/i, '');
    const parsed = parseOsu(text, base);
    if (!parsed) continue;
    if (parsed.mode !== 3) continue;
    if (parsed.circleSize !== 4) continue; // 4K only
    candidates.push({
      name: parsed.version
        ? `${parsed.title} [${parsed.version}]`
        : parsed.title,
      title: parsed.title,
      version: parsed.version,
      notes: parsed.notes,
      noteCount: parsed.notes.length,
    });
  }
  return candidates;
};

// ---------- dispatcher ----------

export const parseChartFile = (filename, text) => {
  const lower = filename.toLowerCase();
  const base = filename.replace(/\.[^.]+$/, '');
  if (lower.endsWith('.sm') || lower.endsWith('.ssc')) {
    return parseSM(text, base);
  }
  if (lower.endsWith('.osu')) {
    return parseOsu(text, base);
  }
  return null;
};

export const SUPPORTED_CHART_EXTENSIONS = '.sm,.ssc,.osu,.osz';
