<template>
  <div class="letter-glitch">
    <canvas ref="canvasRef" class="letter-glitch__canvas" />
    <div v-if="outerVignette" class="letter-glitch__outer-vignette" aria-hidden="true" />
    <div v-if="centerVignette" class="letter-glitch__center-vignette" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, useTemplateRef } from 'vue';

interface Props {
  glitchColors?: string[];
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  smooth?: boolean;
  paused?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  glitchColors: () => ['#2b4539', '#61dca3', '#61b3dc'],
  glitchSpeed: 50,
  centerVignette: false,
  outerVignette: false,
  smooth: true,
  paused: false
});

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');
const animationRef = ref<number | null>(null);
const letters = ref<
  {
    char: string;
    color: string;
    targetColor: string;
    colorProgress: number;
  }[]
>([]);
const grid = ref({ columns: 0, rows: 0 });
const context = ref<CanvasRenderingContext2D | null>(null);
const lastGlitchTime = ref(Date.now());
const pageVisible = ref(true);

const fontSize = 16;
const charWidth = 10;
const charHeight = 20;

const lettersAndSymbols = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  '!',
  '@',
  '#',
  '$',
  '&',
  '*',
  '(',
  ')',
  '-',
  '_',
  '+',
  '=',
  '/',
  '[',
  ']',
  '{',
  '}',
  ';',
  ':',
  '<',
  '>',
  ',',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9'
];

const getRandomChar = () => {
  return lettersAndSymbols[Math.floor(Math.random() * lettersAndSymbols.length)];
};

const getRandomColor = () => {
  return props.glitchColors[Math.floor(Math.random() * props.glitchColors.length)];
};

const hexToRgb = (hex: string) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
};

const interpolateColor = (
  start: { r: number; g: number; b: number },
  end: { r: number; g: number; b: number },
  factor: number
) => {
  const result = {
    r: Math.round(start.r + (end.r - start.r) * factor),
    g: Math.round(start.g + (end.g - start.g) * factor),
    b: Math.round(start.b + (end.b - start.b) * factor)
  };
  return `rgb(${result.r}, ${result.g}, ${result.b})`;
};

const calculateGrid = (width: number, height: number) => {
  const columns = Math.ceil(width / charWidth);
  const rows = Math.ceil(height / charHeight);
  return { columns, rows };
};

const initializeLetters = (columns: number, rows: number) => {
  grid.value = { columns, rows };
  const totalLetters = columns * rows;
  letters.value = Array.from({ length: totalLetters }, () => ({
    char: getRandomChar(),
    color: getRandomColor(),
    targetColor: getRandomColor(),
    colorProgress: 1
  }));
};

const resizeCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const dpr = window.devicePixelRatio || 1;

  const parentWidth = parent.parentElement?.offsetWidth || parent.offsetWidth || window.innerWidth;
  const parentHeight = parent.parentElement?.offsetHeight || parent.offsetHeight || window.innerHeight;

  const width = Math.max(parentWidth, 300);
  const height = Math.max(parentHeight, 300);

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (context.value) {
    context.value.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const { columns, rows } = calculateGrid(width, height);
  initializeLetters(columns, rows);
  drawLetters();
};

const drawLetters = () => {
  if (!context.value || letters.value.length === 0) return;
  const ctx = context.value;
  const { width, height } = canvasRef.value!.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'top';

  letters.value.forEach((letter, index) => {
    const x = (index % grid.value.columns) * charWidth;
    const y = Math.floor(index / grid.value.columns) * charHeight;
    ctx.fillStyle = letter.color;
    ctx.fillText(letter.char, x, y);
  });
};

const updateLetters = () => {
  if (!letters.value || letters.value.length === 0) return;

  const updateCount = Math.max(1, Math.floor(letters.value.length * 0.05));

  for (let i = 0; i < updateCount; i++) {
    const index = Math.floor(Math.random() * letters.value.length);
    if (!letters.value[index]) continue;

    letters.value[index].char = getRandomChar();
    letters.value[index].targetColor = getRandomColor();

    if (!props.smooth) {
      letters.value[index].color = letters.value[index].targetColor;
      letters.value[index].colorProgress = 1;
    } else {
      letters.value[index].colorProgress = 0;
    }
  }
};

const handleSmoothTransitions = () => {
  let needsRedraw = false;
  letters.value.forEach(letter => {
    if (letter.colorProgress < 1) {
      letter.colorProgress += 0.05;
      if (letter.colorProgress > 1) letter.colorProgress = 1;

      const startRgb = hexToRgb(letter.color);
      const endRgb = hexToRgb(letter.targetColor);
      if (startRgb && endRgb) {
        letter.color = interpolateColor(startRgb, endRgb, letter.colorProgress);
        needsRedraw = true;
      }
    }
  });

  if (needsRedraw) {
    drawLetters();
  }
};

const animate = () => {
  if (props.paused || !pageVisible.value) {
    animationRef.value = null;
    drawLetters();
    return;
  }
  const now = Date.now();
  if (now - lastGlitchTime.value >= props.glitchSpeed) {
    updateLetters();
    drawLetters();
    lastGlitchTime.value = now;
  }

  if (props.smooth) {
    handleSmoothTransitions();
  }

  animationRef.value = requestAnimationFrame(animate);
};

let resizeTimeout: ReturnType<typeof setTimeout>;

const handleResize = () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (animationRef.value) {
      cancelAnimationFrame(animationRef.value);
    }
    resizeCanvas();
    animate();
  }, 100);
};

const handleVisibility = () => {
  pageVisible.value = document.visibilityState !== 'hidden';
  if (pageVisible.value && !props.paused && animationRef.value === null) animate();
  else if (!pageVisible.value && animationRef.value !== null) {
    cancelAnimationFrame(animationRef.value);
    animationRef.value = null;
  }
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  context.value = canvas.getContext('2d');
  resizeCanvas();
  animate();

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibility);
});

onUnmounted(() => {
  if (animationRef.value) {
    cancelAnimationFrame(animationRef.value);
  }
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibility);
  clearTimeout(resizeTimeout);
});

watch([() => props.glitchSpeed, () => props.smooth, () => props.paused], () => {
  if (animationRef.value) {
    cancelAnimationFrame(animationRef.value);
  }
  animate();
});
</script>

<style scoped>
.letter-glitch,
.letter-glitch__canvas,
.letter-glitch__outer-vignette,
.letter-glitch__center-vignette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.letter-glitch {
  overflow: hidden;
}

.letter-glitch__outer-vignette,
.letter-glitch__center-vignette {
  pointer-events: none;
}

.letter-glitch__outer-vignette {
  background: radial-gradient(circle, transparent 52%, rgba(0, 0, 0, .48) 78%, #020504 100%);
}

.letter-glitch__center-vignette {
  background: radial-gradient(circle at center, rgba(0, 0, 0, .94) 0%, rgba(0, 0, 0, .83) 20%, rgba(0, 0, 0, .38) 43%, transparent 68%);
}
</style>
