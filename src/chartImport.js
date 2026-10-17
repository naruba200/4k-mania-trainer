// Community chart import: StepMania (.sm / .ssc) and osu!mania (.osu).
// Both parsers target 4-key charts and return the app's chart shape:
//   { name, notes: [{ time (ms), column (0-3), hold (ms|null) }] }
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
            notes.push({ time, column: c, hold: null });
          } else if (ch === '2') {
            holdHeads[c] = { beat, time };
          } else if (ch === '3' && holdHeads[c]) {
            const head = holdHeads[c];
            delete holdHeads[c];
            notes.push({ time: head.time, column: c, hold: time - head.time });
          }
          // 'M' (mine) and anything else: skipped.
        }
      });
    });
    // Unclosed hold heads become taps.
    for (const [c, head] of Object.entries(holdHeads)) {
      notes.push({ time: head.time, column: Number(c), hold: null });
    }
    notes.sort((a, b) => a.time - b.time || a.column - b.column);
    if (notes.length > 0) return { name: title, notes };
  }
  return null;
};

// ---------- osu!mania (.osu) ----------

const parseOsu = (text, fallbackName) => {
  const lines = text.split('\n').map((l) => l.trim());
  let mode = null;
  let title = fallbackName;
  let inObjects = false;
  const notes = [];
  const holdEnds = {}; // "col@time" -> endTime (dedup)

  for (const line of lines) {
    if (line.startsWith('[')) {
      inObjects = line === '[HitObjects]';
      continue;
    }
    if (!inObjects) {
      if (line.startsWith('Mode:')) mode = parseInt(line.slice(5), 10);
      else if (line.startsWith('Title:')) title = line.slice(6).trim() || fallbackName;
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
        notes.push({ time, column, hold: endTime - time });
      } else {
        notes.push({ time, column, hold: null });
      }
    } else {
      const key = `${column}@${time}`;
      if (holdEnds[key]) continue;
      holdEnds[key] = 1;
      notes.push({ time, column, hold: null });
    }
  }
  if (mode !== 3 || notes.length === 0) return null;
  notes.sort((a, b) => a.time - b.time || a.column - b.column);
  return { name: title, notes };
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

export const SUPPORTED_CHART_EXTENSIONS = '.sm,.ssc,.osu';
