const fs = require('fs');

function hue(h, s, l) { return 'hsl(' + h + ', ' + s + '%, ' + l + '%)'; }

// ========== ATMOSPHERIC PRESETS (25 patterns) ==========
const atmospheric = [];
const atmEmotions = ['happy', 'sad', 'angry', 'surprised', 'love', 'fear', 'neutral'];

// Sky variations
for (let i = 0; i < 8; i++) {
  const h1 = i * 45;
  const h2 = (h1 + 30) % 360;
  atmospheric.push({
    id: 'atm-sky-' + i,
    label: 'Sky ' + i,
    category: 'atmospheric',
    emotionTag: atmEmotions[i % atmEmotions.length],
    css: 'linear-gradient(180deg, ' + hue(h1, 60, 70) + ' 0%, ' + hue(h2, 50, 80) + ' 50%, ' + hue((h1+60)%360, 40, 85) + ' 100%), ' + hue(h1, 60, 70)
  });
}

// Storm variations
for (let i = 0; i < 5; i++) {
  const r = 0x1a + i * 5;
  const g = 0x1a + i * 5;
  const b = 0x1a + i * 5;
  const c1 = 'rgb(' + (200-i*20) + ', ' + (210-i*10) + ', 220)';
  atmospheric.push({
    id: 'atm-storm-' + i,
    label: 'Storm ' + i,
    category: 'atmospheric',
    emotionTag: 'angry',
    css: 'radial-gradient(ellipse 60% 40% at ' + (30+i*10) + '% ' + (60+i*5) + '%, ' + c1 + ', transparent 70%), linear-gradient(180deg, rgb(' + r + ',' + g + ',' + b + ') 0%, rgb(' + (r+16) + ',' + (g+16) + ',' + (b+16) + ') 50%, rgb(' + (r+32) + ',' + (g+32) + ',' + (b+32) + ') 100%)'
  });
}

// Fire variations
for (let i = 0; i < 4; i++) {
  const shift = i * 15;
  atmospheric.push({
    id: 'atm-fire-' + i,
    label: 'Fire ' + i,
    category: 'atmospheric',
    emotionTag: 'angry',
    css: 'radial-gradient(ellipse 50% 40% at 50% 80%, hsla(' + shift + ', 80%, 60%, 0.5), transparent 70%), linear-gradient(180deg, hsl(' + shift + ', 70%, 20%) 0%, hsl(' + (shift+20) + ', 75%, 30%) 40%, hsl(' + (shift+40) + ', 80%, 50%) 70%, hsl(' + (shift+50) + ', 85%, 60%) 100%)'
  });
}

// Mist variations
for (let i = 0; i < 4; i++) {
  const base = 180 + i * 30;
  atmospheric.push({
    id: 'atm-mist-' + i,
    label: 'Mist ' + i,
    category: 'atmospheric',
    emotionTag: 'sad',
    css: 'radial-gradient(ellipse 80% 60% at ' + (40+i*5) + '% ' + (30+i*10) + '%, hsla(' + base + ', 30%, 85%, 0.5), transparent 60%), linear-gradient(180deg, hsl(' + base + ', 20%, 75%) 0%, hsl(' + (base+10) + ', 25%, 80%) 50%, hsl(' + (base+20) + ', 30%, 85%) 100%)'
  });
}

// Galaxy variations
for (let i = 0; i < 4; i++) {
  atmospheric.push({
    id: 'atm-galaxy-' + i,
    label: 'Galaxy ' + i,
    category: 'atmospheric',
    emotionTag: 'love',
    css: 'radial-gradient(ellipse 40% 30% at ' + (20+i*15) + '% ' + (30+i*10) + '%, hsla(' + (280+i*20) + ', 70%, 60%, 0.5), transparent 70%), radial-gradient(ellipse 35% 35% at ' + (70-i*10) + '% ' + (60-i*5) + '%, hsla(' + (200+i*30) + ', 60%, 55%, 0.45), transparent 70%), linear-gradient(180deg, #060818 0%, #0c1028 50%, #080c20 100%)'
  });
}

// ========== GEOMETRIC PRESETS (25 patterns) ==========
const geometric = [];

// Stripes variations
for (let i = 0; i < 6; i++) {
  const angle = 30 + i * 15;
  const c1 = hue(i * 60, 50, 85);
  const c2 = hue((i * 60 + 30) % 360, 45, 80);
  geometric.push({
    id: 'geo-stripes-' + i,
    label: 'Stripes ' + i,
    category: 'geometric',
    emotionTag: 'neutral',
    css: 'repeating-linear-gradient(' + angle + 'deg, ' + c1 + ' 0 12px, ' + c2 + ' 12px 24px)'
  });
}

// Dots variations
for (let i = 0; i < 6; i++) {
  const size = 16 + i * 8;
  const c = hue(i * 60, 30, 80);
  geometric.push({
    id: 'geo-dots-' + i,
    label: 'Dots ' + i,
    category: 'geometric',
    emotionTag: 'neutral',
    css: 'radial-gradient(circle at center, ' + c + ' 1.5px, transparent 2px) 0 0 / ' + size + 'px ' + size + 'px, hsl(' + (i*60) + ', 20%, 95%)'
  });
}

// Grid variations
for (let i = 0; i < 5; i++) {
  const color = hue(i * 72, 35, 70);
  geometric.push({
    id: 'geo-grid-' + i,
    label: 'Grid ' + i,
    category: 'geometric',
    emotionTag: 'neutral',
    css: 'linear-gradient(to right, ' + color + ' 1px, transparent 1px) 0 0 / ' + (20+i*8) + 'px ' + (20+i*8) + 'px, linear-gradient(to bottom, ' + color + ' 1px, transparent 1px) 0 0 / ' + (20+i*8) + 'px ' + (20+i*8) + 'px, hsl(' + (i*72) + ', 15%, 95%)'
  });
}

// Checker variations
for (let i = 0; i < 4; i++) {
  const c1 = hue(i * 90, 40, 85);
  const c2 = hue((i * 90 + 45) % 360, 40, 80);
  geometric.push({
    id: 'geo-checker-' + i,
    label: 'Checker ' + i,
    category: 'geometric',
    emotionTag: 'happy',
    css: 'conic-gradient(' + c1 + ' 0 25%, ' + c2 + ' 0 50%, ' + c1 + ' 0 75%, ' + c2 + ' 0) 0 0 / ' + (40+i*20) + 'px ' + (40+i*20) + 'px'
  });
}

// Waves
for (let i = 0; i < 4; i++) {
  const c = hue(200 + i * 20, 40, 85);
  geometric.push({
    id: 'geo-waves-' + i,
    label: 'Waves ' + i,
    category: 'geometric',
    emotionTag: 'sad',
    css: 'repeating-radial-gradient(circle at 50% 0%, transparent 0, transparent ' + (10+i*2) + 'px, ' + c + ' ' + (10+i*2) + 'px ' + (11+i*2) + 'px), hsl(200, 20%, 95%)'
  });
}

// ========== ABSTRACT PRESETS (25 patterns) ==========
const abstract = [];

// Mesh gradients
for (let i = 0; i < 8; i++) {
  const h = i * 45;
  abstract.push({
    id: 'abs-mesh-' + i,
    label: 'Mesh ' + i,
    category: 'abstract',
    emotionTag: i % 2 === 0 ? 'happy' : 'surprised',
    css: 'radial-gradient(at ' + (20+i*5) + '% ' + (20+i*5) + '%, hsla(' + h + ', 70%, 65%, 0.8) 0%, transparent 55%), radial-gradient(at ' + (80-i*5) + '% ' + (20+i*5) + '%, hsla(' + ((h+60)%360) + ', 65%, 60%, 0.75) 0%, transparent 55%), radial-gradient(at ' + (30+i*5) + '% ' + (80-i*5) + '%, hsla(' + ((h+120)%360) + ', 70%, 55%, 0.7) 0%, transparent 55%), radial-gradient(at ' + (75-i*5) + '% ' + (75-i*5) + '%, hsla(' + ((h+180)%360) + ', 65%, 65%, 0.7) 0%, transparent 60%), hsl(' + h + ', 50%, 20%)'
  });
}

// Radial glows
for (let i = 0; i < 6; i++) {
  const h = 200 + i * 30;
  abstract.push({
    id: 'abs-radial-' + i,
    label: 'Radial ' + i,
    category: 'abstract',
    emotionTag: i % 3 === 0 ? 'love' : 'surprised',
    css: 'radial-gradient(circle at ' + (30+i*8) + '% ' + (30+i*8) + '%, hsla(' + h + ', 80%, 60%, 0.6) 0%, transparent 50%), radial-gradient(circle at ' + (70-i*8) + '% ' + (70-i*8) + '%, hsla(' + ((h+120)%360) + ', 75%, 55%, 0.55) 0%, transparent 50%), hsl(' + h + ', 40%, 15%)'
  });
}

// Conic sweeps
for (let i = 0; i < 5; i++) {
  abstract.push({
    id: 'abs-conic-' + i,
    label: 'Conic ' + i,
    category: 'abstract',
    emotionTag: 'surprised',
    css: 'conic-gradient(from ' + (i*72) + 'deg at 50% 50%, hsl(' + (i*72) + ', 60%, 55%), hsl(' + ((i*72+72)%360) + ', 60%, 55%), hsl(' + ((i*72+144)%360) + ', 60%, 55%), hsl(' + ((i*72+216)%360) + ', 60%, 55%), hsl(' + ((i*72+288)%360) + ', 60%, 55%), hsl(' + (i*72) + ', 60%, 55%))'
  });
}

// Soft blobs
for (let i = 0; i < 6; i++) {
  const h = 40 + i * 50;
  abstract.push({
    id: 'abs-blob-' + i,
    label: 'Blob ' + i,
    category: 'abstract',
    emotionTag: 'happy',
    css: 'radial-gradient(ellipse 45% 35% at ' + (25+i*8) + '% ' + (35+i*5) + '%, hsla(' + h + ', 60%, 75%, 0.7) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at ' + (70-i*5) + '% ' + (60-i*5) + '%, hsla(' + ((h+60)%360) + ', 55%, 70%, 0.65) 0%, transparent 60%), hsl(' + h + ', 30%, 90%)'
  });
}

// ========== SCENE PRESETS (25 patterns) ==========
const scene = [];

// Room variations
for (let i = 0; i < 6; i++) {
  const h = 25 + i * 10;
  scene.push({
    id: 'scn-room-' + i,
    label: 'Room ' + i,
    category: 'scene',
    emotionTag: i % 2 === 0 ? 'happy' : 'neutral',
    css: 'radial-gradient(ellipse 55% 40% at 50% ' + (20+i*5) + '%, hsla(' + (h+30) + ', 80%, 75%, 0.5), transparent 55%), linear-gradient(to bottom, transparent 0%, transparent 65%, hsla(' + h + ', 40%, 20%, 0.6) 68%, hsla(' + h + ', 40%, 15%, 0.9) 100%), linear-gradient(to bottom, hsl(' + (h+10) + ', 35%, ' + (70+i*3) + '%) 0%, hsl(' + h + ', 30%, ' + (60+i*3) + '%) 65%)'
  });
}

// Outdoor variations
for (let i = 0; i < 6; i++) {
  const h = 100 + i * 30;
  scene.push({
    id: 'scn-outdoor-' + i,
    label: 'Outdoor ' + i,
    category: 'scene',
    emotionTag: i % 3 === 0 ? 'happy' : 'sad',
    css: 'linear-gradient(180deg, hsl(' + h + ', 50%, ' + (70+i*2) + '%) 0%, hsl(' + (h+10) + ', 45%, ' + (75+i*2) + '%) 40%, hsl(' + (h+30) + ', 35%, ' + (50+i*3) + '%) 60%, hsl(' + (h+40) + ', 40%, ' + (40+i*3) + '%) 100%)'
  });
}

// Stage variations
for (let i = 0; i < 5; i++) {
  const h = i * 72;
  scene.push({
    id: 'scn-stage-' + i,
    label: 'Stage ' + i,
    category: 'scene',
    emotionTag: i % 2 === 0 ? 'surprised' : 'neutral',
    css: 'radial-gradient(ellipse 70% 35% at 50% 0%, hsla(' + (h+30) + ', 80%, 70%, 0.5), transparent 65%), radial-gradient(ellipse 120% 50% at 50% 110%, rgba(0,0,0,0.7), transparent 60%), hsl(' + h + ', 40%, 12%)'
  });
}

// Abstract room
for (let i = 0; i < 4; i++) {
  const h = 200 + i * 20;
  scene.push({
    id: 'scn-abstract-room-' + i,
    label: 'Abstract Room ' + i,
    category: 'scene',
    emotionTag: 'fear',
    css: 'radial-gradient(ellipse 50% 45% at ' + (30+i*10) + '% ' + (25+i*5) + '%, hsla(' + h + ', 50%, 60%, 0.4), transparent 60%), linear-gradient(to bottom, hsl(' + h + ', 35%, 15%) 0%, hsl(' + (h+10) + ', 30%, 12%) 100%)'
  });
}

// Neon signs
for (let i = 0; i < 4; i++) {
  const h = 300 + i * 15;
  scene.push({
    id: 'scn-neon-' + i,
    label: 'Neon ' + i,
    category: 'scene',
    emotionTag: 'surprised',
    css: 'repeating-linear-gradient(to right, transparent 0px, transparent ' + (80+i*20) + 'px, hsla(' + h + ', 90%, 65%, 0.08) ' + (80+i*20) + 'px, hsla(' + h + ', 90%, 65%, 0.08) ' + (82+i*20) + 'px, transparent ' + (82+i*20) + 'px, transparent ' + (160+i*40) + 'px, hsla(' + ((h+120)%360) + ', 90%, 60%, 0.1) ' + (160+i*40) + 'px, hsla(' + ((h+120)%360) + ', 90%, 60%, 0.1) ' + (162+i*40) + 'px, transparent ' + (162+i*40) + 'px, transparent ' + (300+i*60) + 'px), radial-gradient(ellipse 100% 35% at 50% 75%, hsla(' + h + ', 80%, 55%, 0.35), hsla(' + ((h+60)%360) + ', 60%, 40%, 0.15) 40%, transparent 70%), hsl(' + h + ', 50%, 8%)'
  });
}

// Helper to format TypeScript array
function formatPresetArray(name, presets) {
  const items = presets.map(p => {
    return '  {\n    id: "' + p.id + '",\n    label: "' + p.label + '",\n    category: "' + p.category + '",\n    css: `' + p.css + '`,\n    emotionTag: "' + p.emotionTag + '",\n  }';
  }).join(',\n');
  return 'import type { BackgroundPreset } from "./types"\n\nexport const ' + name + ': BackgroundPreset[] = [\n' + items + '\n]';
}

fs.writeFileSync('src/lib/backgroundPresets/atmospheric.ts', formatPresetArray('atmosphericPresets', atmospheric));
fs.writeFileSync('src/lib/backgroundPresets/geometric.ts', formatPresetArray('geometricPresets', geometric));
fs.writeFileSync('src/lib/backgroundPresets/abstract.ts', formatPresetArray('abstractPresets', abstract));
fs.writeFileSync('src/lib/backgroundPresets/scene.ts', formatPresetArray('scenePresets', scene));

const total = atmospheric.length + geometric.length + abstract.length + scene.length;
console.log('Generated ' + total + ' background presets:');
console.log('  atmospheric: ' + atmospheric.length);
console.log('  geometric: ' + geometric.length);
console.log('  abstract: ' + abstract.length);
console.log('  scene: ' + scene.length);
