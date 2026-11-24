// Builds the restyled copies of LG's surface-manager notification QML (alerts + toasts)
// from the STOCK files. Usage: node make-patch.js <stockNotificationDir> <outDir>
// Look matches the My Home launcher: dark cards, white text, white focus ring.
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node make-patch.js <stockDir> <outDir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

function patch(file, reps) {
  let s = fs.readFileSync(path.join(src, file), 'utf8');
  for (const [from, to, n] of reps) {
    const cnt = s.split(from).length - 1;
    if (cnt !== n) throw new Error(`${file}: expected ${n}x ${JSON.stringify(from)}, found ${cnt}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(path.join(out, file), s);
  console.log('patched', file);
}

const CARD = '#16161c', CARD2 = '#34363d', FOCUS_BG = '#23232c';

patch('NotificationStyle.qml', [
  ['property color defaultFocusColor: "#cf0652"', 'property color defaultFocusColor: "#ffffff"', 1],
  // alert card (base + variations.defaultView)
  ['backgroundColor:        "#CACBCC"', `backgroundColor:        "${CARD}"`, 2],
  ['borderColor:            "#bbbbbb"', 'borderColor:            "#2effffff"', 2],
  ['foregroundColor:        "#4d4d4d"', 'foregroundColor:        "#ffffff"', 2],
  ['alertTextColor:         "#2E3239"', 'alertTextColor:         "#e6e6e6"', 2],
  ['titleRulerColor:        "#a7a7a7"', 'titleRulerColor:        "#33ffffff"', 2],
  ['radius:                 getRValue(12)', 'radius:                 getRValue(20)', 2],
  ['backgroundOpacity:      0.95', 'backgroundOpacity:      0.97', 2],
  // buttons
  ['backgroundColor:        "#686868"', `backgroundColor:        "${CARD2}"`, 2],
  // toasts
  ['backgroundColor:        "#787F86"', `backgroundColor:        "${CARD}"`, 1],
  ['lightBackgroundColor:   "#000000"', `lightBackgroundColor:   "${CARD}"`, 1],
  ['lightOpacity:           0.5', 'lightOpacity:           0.94', 1],
  ['backgroundRadius:       getRValue(12)', 'backgroundRadius:       getRValue(38)', 1],
  ['slashFocusedColor:      "#ffffff"', 'slashFocusedColor:      "#111111"', 1],
  // pincode keypad: focus fill is now white -> dark digits
  ['numPadFontActiveColor:          "#ffffff"', 'numPadFontActiveColor:          "#111111"', 1],
]);

// Alert buttons: dark pill, focused = darker fill + white 4px ring + scale (like launcher tiles)
patch('SimpleButton.qml', [
  ['property color textColor: root.hasFocus ? "#4C5059" : "#E6E6E6"', 'property color textColor: "#ffffff"', 1],
  ['property color bgColor: root.hasFocus ? "#E6E6E6" : (noBackgroundColor ? "transparent" : "#7D848C")',
   `property color bgColor: root.hasFocus ? "${FOCUS_BG}" : (noBackgroundColor ? "transparent" : "${CARD2}")`, 1],
  ['        radius: 6\n\n        border.width: useStroke ? 1 : 0\n        border.color: "#FFFFFF"',
   '        radius: height / 2\n\n        border.width: root.hasFocus ? root.style.getRValue(4) : (useStroke ? 1 : 0)\n        border.color: "#FFFFFF"', 1],
  ['PropertyChanges {target: label; color: "#4C5059"}', 'PropertyChanges {target: label; color: "#ffffff"}', 1],
]);

// Generic Button (used by other notification views)
patch('Button.qml', [
  ['        color: mouseArea.highlight ?  root.style.button.activatedColor : root.style.button.backgroundColor\n        radius: 3',
   `        color: mouseArea.highlight ?  "${FOCUS_BG}" : root.style.button.backgroundColor\n        radius: height / 2\n        border.width: mouseArea.highlight ? 4 : 0\n        border.color: "#ffffff"`, 1],
  ['color: mouseArea.highlight ? root.style.button.textActivatedColor : root.style.button.textColor', 'color: "#ffffff"', 1],
]);

// Toast: subtle white hairline instead of LG's, keep shadow
patch('Toast.qml', [
  ['border.color: "#1affffff"', 'border.color: "#2effffff"', 1],
]);
