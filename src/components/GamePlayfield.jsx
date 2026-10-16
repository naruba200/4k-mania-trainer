import { useRef, useEffect, useCallback } from 'react';
import { useGameLoop } from '../hooks/useGameLoop';
import { useKeyboardListener } from '../hooks/useKeyboardListener';
import { calculateHitJudgement, generatePattern, calculateScore, calculateAccuracy } from '../utils';
import { JUDGEMENTS } from '../types';

const KEYS = ['d', 'f', 'j', 'k'];

const Playfield = ({ settings, onGameEnd }) => {
  const canvasRef = useRef();
  const ctxRef = useRef();

  const notesRef = useRef([]);
  const judgementsRef = useRef({});
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const gameOverRef = useRef(false);
  const { isKeyPressed } = useKeyboardListener(KEYS);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    // Generate pattern based on settings
    const notes = generatePattern(settings);
    notesRef.current = notes.map(note => ({
      ...note,
      y: -50,
      duration: 50,
      hit: undefined
    }));

    // Set up canvas
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [settings]);

  useGameLoop((deltaTime) => {
    if (!canvasRef.current || !ctxRef.current || gameOverRef.current) return;

    const currentTime = Date.now() - startTimeRef.current;
    const { width, height } = canvasRef.current;

    // Clear canvas
    ctxRef.current.clearRect(0, 0, width, height);

    // Check if game is over
    if (currentTime >= settings.duration * 1000) {
      gameOverRef.current = true;
      onGameEnd({
        score: scoreRef.current,
        accuracy: calculateAccuracy(judgementsRef.current),
        maxCombo: calculateScore(judgementsRef.current).maxCombo,
        judgements: judgementsRef.current,
      });
      return;
    }

    // Update and draw notes
    const activeNotes = [];
    const columnWidth = width / 4;

    notesRef.current.forEach(note => {
      // Check if note should be active
      if (currentTime >= note.time) {
        // Update note position
        note.y += deltaTime * 0.5 * settings.scrollSpeed;

        // Check for hit
        if (note.hit === undefined && note.y + 25 >= height - 50 && note.y + 25 <= height - 10) {
          for (let i = 0; i < 4; i++) {
            if (Array.isArray(note.column) ? note.column.includes(i) : note.column === i) {
              if (isKeyPressed(KEYS[i])) {
                const hitDelta = Math.abs(currentTime - note.time);
                const judgement = calculateHitJudgement(hitDelta);

                if (judgement !== 'MISS') {
                  const { points, name } = JUDGEMENTS[judgement];
                  scoreRef.current += points;
                  comboRef.current++;
                  judgementsRef.current[judgement] = (judgementsRef.current[judgement] || 0) + 1;
                  note.hit = true;
                  break;
                }
              }
            }
          }

          // If note hasn't been hit, mark as missed
          if (note.hit === undefined) {
            judgementsRef.current.MISS = (judgementsRef.current.MISS || 0) + 1;
            comboRef.current = 0;
            note.hit = false;
          }
        }

        // Draw note
        if (note.y < height + 50) {
          const x = (Array.isArray(note.column) ? note.column[0] : note.column) * columnWidth + columnWidth / 2;
          ctxRef.current.fillStyle = note.hit === true ? '#4ecdc4' : note.hit === false ? '#ff6b6b' : '#fff';
          ctxRef.current.fillRect(x - 25, note.y, 50, note.duration);
          activeNotes.push(note);
        }
      }
    });

    notesRef.current = activeNotes;

    // Draw receptor line
    ctxRef.current.strokeStyle = '#5a5a7a';
    ctxRef.current.lineWidth = 2;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(0, height - 50);
    ctxRef.current.lineTo(width, height - 50);
    ctxRef.current.stroke();

    // Draw columns
    for (let i = 0; i < 4; i++) {
      const x = i * columnWidth + columnWidth / 2;
      ctxRef.current.fillStyle = '#666';
      ctxRef.current.strokeStyle = '#555';
      ctxRef.current.lineWidth = 1;
      ctxRef.current.beginPath();
      ctxRef.current.arc(x, height - 50, 10, 0, Math.PI * 2);
      ctxRef.current.fill();
      ctxRef.current.stroke();
    }

    // Draw score and combo
    ctxRef.current.fillStyle = '#fff';
    ctxRef.current.font = '20px monospace';
    ctxRef.current.fillText(`Score: ${scoreRef.current}`, 20, 30);
    ctxRef.current.fillText(`Combo: ${comboRef.current}`, 20, 60);
  }, [settings, isKeyPressed]);

  return (
    <div className="playfield">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default Playfield;
