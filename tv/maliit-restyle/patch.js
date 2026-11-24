// My Home: restyle LG's system on-screen keyboard (Maliit plugin QML) + remote colour keys.
// usage: node patch.js <stock qml dir copy> <out dir>
//   stock = copy of /usr/lib/maliit/plugins/qml from the TV. Output is bind-mounted over that path
//   (deploy/init.d/40-maliit-restyle.sh). Reversible: umount /usr/lib/maliit/plugins/qml; pkill MaliitServer.
// Look: our hub palette (dark panel, #2a2a33 keys, white focus with dark text, red accent for Enter), rounder keys.
// Colour keys while the keyboard is up: 🔴 Shift (twice — Caps) · 🟢 delete a character, hold — clear all ·
// 🟡 cursor ◀ · 🔵 cursor ▶. Unknown keys are logged as «MYHOME-KB key=…» (to confirm key codes).
const fs = require('fs'), path = require('path');
const [, , src, out] = process.argv;
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { const pa = path.join(a, e.name), pb = path.join(b, e.name); e.isDirectory() ? copyDir(pa, pb) : fs.copyFileSync(pa, pb); } }
fs.rmSync(out, { recursive: true, force: true }); copyDir(src, out);

// ---- 1. palette (every .qml) ----
const MAP = {
  '#3B4045': '#141418',   // panel background
  '#42484E': '#2A2A33',   // key background
  '#545A64': '#2A2A33',   // key border → invisible
  '#E6E6E6': '#F2F2F2',   // key text / focus background
  '#4C5059': '#111111',   // text on the white focus
  '#31363A': '#22222A',   // shift dot off
  '#30AD6B': '#FFFFFF',   // shift dot on
  '#248351': '#E11D2A',   // Enter / OK → our red accent
  '#ABAEB3': '#9A9AA3',   // dim text
  '#62676A': '#3B3B48', '#6E7276': '#55555F'   // prediction panel
};
let nColor = 0, nRadius = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.qml$/.test(e.name)) continue;
    let s = fs.readFileSync(p, 'utf8'), o = s;
    s = s.replace(/"#([0-9A-Fa-f]{6})"/g, (m, h) => { const k = '#' + h.toUpperCase(); if (MAP[k]) { nColor++; return '"' + MAP[k] + '"'; } return m; });
    s = s.replace(/property int radius:( *)12 \/ resolution/g, () => { nRadius++; return 'property int radius: 28 / resolution'; });
    if (s !== o) fs.writeFileSync(p, s);
  }
})(out);

// ---- 2. colour keys ----
function patch(rel, pairs) {
  const p = path.join(out, rel); let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) { if (s.split(a).length !== 2) throw new Error(rel + ': not unique/missing: ' + a.slice(0, 70)); s = s.replace(a, b); }
  fs.writeFileSync(p, s);
}
// Shift is LeftFunctionArea's own button: expose a function that "releases" it exactly like a click
patch('keyboard-common/LeftFunctionArea.qml', [[
  `    onSupportShiftModeChanged:`,
  `    // My Home: 🔴 on the remote = this Shift button
    function myHomePressShift() { if (supportShiftMode && shiftButton.state !== "Disable") shiftButton.released(2); }

    onSupportShiftModeChanged:`]]);
patch('view-global/NormalKeyboard.qml', [[
  `    Keys.onPressed: {
        if (event.key === Qt.Key_Up)
            PluginProxy.onHideRequested(true);
    }`,
  `    Keys.onPressed: {
        if (event.key === Qt.Key_Up)
            PluginProxy.onHideRequested(true);
    }
    function myHomeShift() { leftFunctionArea.myHomePressShift(); }
    // My Home: LG's C++ delivers remote keys into this (enabled, off-screen) keyboard; a focused proxy forwards them to ours
    Item {
        id: myHomeProxy
        Keys.onPressed: { try { myKb.handleKey(event); } catch (e) {} }
        Keys.onReleased: { try { myKb.handleRelease(event); } catch (e) {} }
        onActiveFocusChanged: if (!activeFocus) myHomeRegrab.restart()
    }
    Timer { id: myHomeRegrab; interval: 0; onTriggered: { try { if (myKb.enabled && !myHomeProxy.activeFocus) myHomeProxy.forceActiveFocus(); } catch (e) {} } }
    function myHomeGrab() { myHomeProxy.forceActiveFocus(); }`]]);
patch('view-global/main.qml', [[
  `    Keys.onPressed: {
        if (event.key === Qt.Key_Up) {
            hideRequested(true);
            event.accepted = true;
        }
    }`,
  `    // ---- My Home: remote colour keys over the keyboard ----
    property double myHomeGreenT: 0
    property bool myHomeCleared: false
    function myHomeColor(ev) {
        // Qt names first, then the remote's evdev codes (scan code = evdev + 8 on some builds)
        var k = ev.key, n = ev.nativeScanCode;
        if (k === Qt.Key_Red    || n === 398 || n === 406) return 1;
        if (k === Qt.Key_Green  || n === 399 || n === 407) return 2;
        if (k === Qt.Key_Yellow || n === 400 || n === 408) return 3;
        if (k === Qt.Key_Blue   || n === 401 || n === 409) return 4;
        return 0;
    }
    Keys.onPressed: {
        if (event.key === Qt.Key_Up) {
            hideRequested(true);
            event.accepted = true;
            return;
        }
        var c = myHomeColor(event);
        if (!c) { console.warn("MYHOME-KB key=" + event.key + " scan=" + event.nativeScanCode + " repeat=" + event.isAutoRepeat); return; }
        event.accepted = true;
        if (state === "Number-Keyboard" && c === 1) return;
        if (c === 1 && !event.isAutoRepeat) normalKeyboard.myHomeShift();
        else if (c === 2) {
            if (!event.isAutoRepeat) { myHomeGreenT = Date.now(); myHomeCleared = false; keyPressed("14", false, 2); }
            else if (!myHomeCleared && Date.now() - myHomeGreenT > 600) { myHomeCleared = true; clearAllPressed(); }
        }
        else if (c === 3) moveCursorPosition(0, 2);
        else if (c === 4) moveCursorPosition(1, 2);
    }
    Keys.onReleased: { if (myHomeColor(event)) event.accepted = true; }`]]);
// ---- 3. our keyboard replaces LG's letter AND number keyboards (user: «вообще везде наше») ----
fs.copyFileSync(path.join(__dirname, 'MyHomeKeyboard.qml'), path.join(out, 'view-global/MyHomeKeyboard.qml'));
patch('view-global/main.qml', [
  // the element itself (before LG's NormalKeyboard)
  [`    // Normal Keyboard
    NormalKeyboard {`,
   `    // My Home keyboard (drawn instead of LG's letter and number keyboards)
    MyHomeKeyboard {
        id: myKb
        objectName: "myHomeKeyboard"
        anchors.left: parent.left
        enabled: false
        visible: enabled
        y: windowHeight
        fontFamily: style.defaultFontFamily
        url: contentType === Maliit.UrlContentType || contentType === Maliit.EmailContentType
        numeric: contentType === Maliit.NumberContentType || contentType === Maliit.PhoneNumberContentType
        onSendText: root.textKeyPressed(t)
        onSendKey: root.keyPressed(raw, false, ev)
        // LG's own cursor move (same as its ◀ ▶ buttons). Some apps ignore it — LG's browser does, even for LG's keyboard.
        onCursorMove: root.moveCursorPosition(dir, 2)
        onClearAll: root.clearAllPressed()
        onEnabledChanged: if (enabled) { reset(); normalKeyboard.myHomeGrab(); }
        onNumericChanged: if (enabled) reset()
        onUrlChanged: if (enabled) build()
    }

    // colour keys: our surface-manager key filter writes myhome/vkbKey while the keyboard is visible
    Service {
        id: myHomeKeySub
        appId: "com.webos.service.ime.globalplugin"
        service: "com.webos.settingsservice"
        method: "getSystemSettings"
        property bool primed: false
        onResponse: {
            var j = null;
            try { j = JSON.parse(payload); } catch (e) { return; }
            var v = j && j.settings ? j.settings.vkbKey : "";
            if (!primed) { primed = true; myKb.lastRemote = v || ""; return; }   // first reply = old value
            myKb.remoteColour(v);
        }
        Component.onCompleted: callService({"category": "myhome", "keys": ["vkbKey"], "subscribe": true})
    }

    // interface language (hub → «Мова»): labels/hints of our keyboard
    Service {
        id: myHomeLangSub
        appId: "com.webos.service.ime.globalplugin"
        service: "com.webos.settingsservice"
        method: "getSystemSettings"
        onResponse: {
            var j = null;
            try { j = JSON.parse(payload); } catch (e) { return; }
            var v = j && j.settings ? j.settings.uiLang : "";
            if (v) myKb.uiLang = v;
        }
        Component.onCompleted: callService({"category": "myhome", "keys": ["uiLang"], "subscribe": true})
    }

    // Normal Keyboard
    NormalKeyboard {`],
  // LG's prediction panel resizes the window for its own keyboard — not while ours is up
  [`            PluginProxy.setPanelSize(normalKeyboard.width,newHeight);`,
   `            if (!myKb.enabled) PluginProxy.setPanelSize(normalKeyboard.width,newHeight);`],
  // letter state → ours
  [`            PropertyChanges {
                target: normalKeyboard
                enabled: true
                y: 0
                focus: true
            }
            PropertyChanges {
                target: numberKeyboard
                enabled: false
                visible: false
            }`,
   `            PropertyChanges {
                target: myKb
                enabled: true
                y: 0
            }
            PropertyChanges {
                target: normalKeyboard
                enabled: true
                y: windowHeight + 2000
                focus: true
            }
            PropertyChanges {
                target: numberKeyboard
                enabled: false
                visible: false
            }`],
  [`                    PluginProxy.setPanelSize(normalKeyboard.width, normalKeyboard.height);
                    if (orientation.includes("portrait")) normalKeyboard.setMovableArea();`,
   `                    PluginProxy.setPanelSize(myKb.width, myKb.height);
                    normalKeyboard.myHomeGrab();`],
  // number state → ours (opens on the digits page)
  [`            PropertyChanges {
                target: numberKeyboard
                enabled: true
                y: 0
                focus: true
            }
            StateChangeScript {
                script: {
                    PluginProxy.setPanelSize(style.numberKeyboard.width, style.numberKeyboard.height);
                    if (orientation.includes("portrait")) numberKeyboard.setMovableArea();`,
   `            PropertyChanges {
                target: myKb
                enabled: true
                y: 0
            }
            PropertyChanges {
                target: normalKeyboard
                enabled: true
                y: windowHeight + 2000
                focus: true
            }
            StateChangeScript {
                script: {
                    PluginProxy.setPanelSize(myKb.width, myKb.height);
                    normalKeyboard.myHomeGrab();`]
]);
// LG's code pulls focus back to its own (hidden) keyboard whenever the pointer hides — keep it on ours
patch('view-global/main.qml', [[
  `    function setDefaultFocusOnVirtualKeybaord() {`,
  `    function setDefaultFocusOnVirtualKeybaord() {
        if (myKb.enabled) { normalKeyboard.myHomeGrab(); return; }`]]);
console.log('ok: colours', nColor, 'radius', nRadius);
