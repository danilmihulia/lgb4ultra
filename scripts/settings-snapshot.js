// Snapshot of the TV's settings → backups/settings/settings-snapshot-<date>.json (+ restore with settings-restore.js).
// Covers: every system setting our hub shows (default dimension), picture + AI picture for EVERY picture mode on
// default/HDMI 1–4 (they are stored per input × mode), the picture mode chosen per input × SDR/HDR/Dolby Vision,
// game settings per HDMI, sound for the default and the HDMI-1 game input, our own myhome category, LG Quick Access
// (option/magicNum1–9), accessibility colour adjustments, the LG logo flag.
//   node scripts/settings-snapshot.js            (reads only — nothing on the TV is changed)
'use strict';
const fs = require('fs'), path = require('path');
const { tvRun, ROOT } = require('./tvssh');

const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const hub = {};   // category → keys, from the hub's settings list (system settings only)
for (const m of html.matchAll(/\{cat:'([a-zA-Z]+)',key:'([^']+)'([^\n]*)\}/g)) {
  const [, cat, key, rest] = m;
  if (/local:true|special:/.test(rest) || ['ui', 'sounds', 'saver', 'sleep'].includes(cat)) continue;
  (hub[cat] = hub[cat] || new Set()).add(key);
}
const PIC = ['energySaving', 'backlight', 'contrast', 'brightness', 'color', 'sharpness', 'tint', 'colorTemperature', 'gamma', 'colorGamut',
  'dynamicContrast', 'dynamicColor', 'superResolution', 'noiseReduction', 'mpegNoiseReduction', 'smoothGradation', 'peakBrightness', 'blackLevel',
  'realCinema', 'motionEyeCare', 'eyeComfortMode', 'truMotionMode', 'truMotionJudder', 'truMotionBlur', 'motionPro', 'motionProOLED',
  'hdrDynamicToneMapping', 'logoLuminanceAdjust', 'nearBlackDetail', 'filmMakerMode'];
const MODES = ['personalized', 'hdrPersonalized', 'dolbyHdrPersonalized', 'vivid', 'hdrVivid', 'normal', 'eco', 'cinema', 'hdrStandard', 'hdrEco',
  'hdrCinemaBright', 'hdrCinema', 'sports', 'game', 'photo', 'hdrGame', 'filmMaker', 'hdrFilmMaker', 'dolbyHdrVivid', 'dolbyHdrStandard',
  'dolbyHdrCinemaBright', 'dolbyHdrCinema', 'dolbyHdrGame', 'expert1', 'expert2'];
const INPUTS = ['default', 'hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'];
const GAME = ['gameMode', 'gameGenre', 'blackStabilizer', 'whiteStabilizer', 'blueLight', 'gameOptimization', 'freesync', 'enableALLM',
  'inputOptimization', 'enableQuickGame', 'lowLevelAdjustment', 'darkMode', 'enable144HzBooster', 'enableQFT'];
const SND = ['soundMode', 'aigamesound', 'avSync', 'clearVoice', 'virtualSurround', 'userEqualizer', 'userEqualizerValues', 'autoVolume', 'magicSpaceSound'];

const Q = [];   // {category, keys, dimension?}
Object.keys(hub).forEach(c => Q.push({ category: c, keys: [...hub[c]] }));
Q.push({ category: 'myhome', keys: ['uiLang', 'uiTheme', 'keyBinds'] });
Q.push({ category: 'option', keys: ['magicNum1', 'magicNum2', 'magicNum3', 'magicNum4', 'magicNum5', 'magicNum6', 'magicNum7', 'magicNum8', 'magicNum9', 'adjustments'] });
Q.push({ category: 'other', keys: ['lgLogoDisplay', 'uhdDeepColorHDMI1', 'uhdDeepColorHDMI2', 'uhdDeepColorHDMI3', 'uhdDeepColorHDMI4',
  '444BypassHDMI1', '444BypassHDMI2', '444BypassHDMI3', '444BypassHDMI4', 'qmsVrr'] });
for (const input of INPUTS) {
  for (const dr of ['sdr', 'hdr', 'dolbyHdr']) Q.push({ category: 'picture', keys: ['pictureMode'], dimension: { input, dynamicRange: dr } });
  for (const pictureMode of MODES) {
    Q.push({ category: 'picture', keys: PIC, dimension: { input, pictureMode } });
    Q.push({ category: 'aiPicture', keys: ['ai_Picture', 'ai_Brightness', 'ai_Genre'], dimension: { input, pictureMode } });
  }
}
for (let h = 1; h <= 4; h++) Q.push({ category: 'other', keys: GAME, dimension: { gameInput: 'hdmi' + h } });
for (const ai of ['default', 'hdmi1_game']) Q.push({ category: 'sound', keys: SND, dimension: { audioInput: ai, soundOutput: 'tv_speaker' } });

// one shell script on the TV: "Q<n>" line, then the raw one-line JSON answer
let sh = 'q(){ echo "Q$1"; timeout 5 luna-send -n 1 -a com.webos.app.home luna://com.webos.settingsservice/getSystemSettings "$2" </dev/null; echo; }\n';
Q.forEach((q, i) => { sh += 'q ' + i + " '" + JSON.stringify(q) + "'\n"; });
console.log(Q.length + ' queries… (about a minute)');
const out = tvRun(sh, 600000);

const snap = { taken: new Date().toISOString(), note: 'read-only snapshot; restore: node scripts/settings-restore.js <this file>', entries: [] };
let cur = -1, got = 0;
out.split('\n').forEach(line => {
  const m = /^Q(\d+)$/.exec(line.trim()); if (m) { cur = +m[1]; return; }
  if (cur < 0 || !line.trim().startsWith('{')) return;
  let r; try { r = JSON.parse(line); } catch (e) { return; }
  const q = Q[cur]; if (!r.settings) return;
  for (const k of Object.keys(r.settings)) {
    snap.entries.push({ category: q.category, key: k, dimension: q.dimension, seenIn: !q.dimension && r.dimension && Object.keys(r.dimension).length ? r.dimension : undefined, value: r.settings[k] });
    got++;
  }
});
const day = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const file = path.join(ROOT, 'backups', 'settings', 'settings-snapshot-' + day + '.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(snap, null, 1) + '\n');
console.log(got + ' values → ' + path.relative(ROOT, file));
