import { JUDGEMENTS } from './types';

export const calculateNoteSpeed = (bpm, scrollSpeed) => {
  // Convert BPM to milliseconds per beat
  const msPerBeat = 60000 / bpm;
  // Calculate note speed based on scroll speed and BPM
  return msPerBeat * scrollSpeed;
};

export const calculateHitJudgement = (hitDelta) => {
  const absDelta = Math.abs(hitDelta);
  
  for (const [judgement, { window }] of Object.entries(JUDGEMENTS)) {
    if (absDelta <= window) {
      return judgement;
    }
  }
  
  return 'MISS';
};

export const generatePattern = (settings) => {
  const { bpm, patternType, noteCount, duration, speedIncrement } = settings;
  const notes = [];
  const msPerBeat = 60000 / bpm;
  const totalTime = duration * 1000;
  
  // Calculate time between notes based on pattern type
  let timeBetweenNotes;
  switch (patternType) {
    case 'streams':
      timeBetweenNotes = msPerBeat / 2; // 1/8 note intervals
      break;
    case 'jacks':
      timeBetweenNotes = msPerBeat; // 1/4 note intervals
      break;
    case 'jumps':
    case 'chords':
      timeBetweenNotes = msPerBeat * 2; // 1/2 note intervals
      break;
    case 'speed':
      timeBetweenNotes = msPerBeat;
      break;
    default:
      timeBetweenNotes = msPerBeat;
  }
  
  // Generate notes based on pattern type
  for (let i = 0; i < noteCount; i++) {
    const time = i * timeBetweenNotes;
    if (time > totalTime) break;
    
    let column;
    switch (patternType) {
      case 'streams':
        column = i % 4;
        break;
      case 'jacks':
        column = Math.floor(i / 4) % 4;
        break;
      case 'jumps':
        column = (i % 2 === 0) ? 0 : 3;
        break;
      case 'chords':
        column = (i % 2 === 0) ? [0, 3] : [1, 2];
        break;
      case 'speed':
        column = i % 4;
        break;
      default:
        column = Math.floor(Math.random() * 4);
    }
    
    notes.push({
      time,
      column,
      type: patternType,
    });
  }
  
  return notes;
};

export const calculateScore = (judgements) => {
  let totalScore = 0;
  let maxCombo = 0;
  let currentCombo = 0;
  
  for (const judgement of Object.values(judgements)) {
    totalScore += JUDGEMENTS[judgement].points;
    
    if (judgement === 'MISS') {
      currentCombo = 0;
    } else {
      currentCombo++;
      maxCombo = Math.max(maxCombo, currentCombo);
    }
  }
  
  return { totalScore, maxCombo };
};

export const calculateAccuracy = (judgements) => {
  const totalJudgements = Object.keys(judgements).length;
  if (totalJudgements === 0) return 0;
  
  let perfectJudgements = 0;
  for (const judgement of Object.values(judgements)) {
    if (judgement === 'MARVELOUS' || judgement === 'PERFECT') {
      perfectJudgements++;
    }
  }
  
  return (perfectJudgements / totalJudgements) * 100;
};