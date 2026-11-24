/* My Home: our on-screen keyboard, drawn inside LG's Maliit plugin so EVERY app (browser, YouTube, LG apps)
 * gets the same keyboard as the hub and «Файли». Same layouts (УКР/РУС/ENG + 123/#+=), same bottom row,
 * same colour keys and legend, pointer hover/leave behaviour. Text goes to the app through the plugin's own
 * signals (textKeyPressed / keyPressed / moveCursorPosition / clearAllPressed) wired in main.qml.
 * Installed by deploy/maliit-restyle/patch.js → view-global/MyHomeKeyboard.qml. */
import QtQuick 2.0
import QtQuick.Window 2.2

Item {
    id: kb
    signal sendText(string t)
    signal sendKey(string raw, int ev)
    // how the current key was pressed, as LG's IME expects: 1 = pointer click, 2 = remote key (apps drop Enter sent as "key" after a click)
    property int evType: 2
    signal cursorMove(int dir)
    signal clearAll()

    property bool url: false
    property bool numeric: false
    property string fontFamily: "LG Smart UI"
    property real sc: Screen.width / 1920

    readonly property var lay: ({
        uk: [["й","ц","у","к","е","н","г","ш","щ","з","х","ї"],["ф","і","в","а","п","р","о","л","д","ж","є"],["я","ч","с","м","и","т","ь","б","ю","ґ","'"]],
        ru: [["й","ц","у","к","е","н","г","ш","щ","з","х","ъ"],["ф","ы","в","а","п","р","о","л","д","ж","э"],["я","ч","с","м","и","т","ь","б","ю","ё","-"]],
        en: [["q","w","e","r","t","y","u","i","o","p"],["a","s","d","f","g","h","j","k","l"],["z","x","c","v","b","n","m","-","."]],
        num: [["1","2","3","4","5","6","7","8","9","0"],["@","#","&","_","-","+","(",")","/","="],[".",",",":",";","?","!","\"","'","*","%"]],
        sym: [["[","]","{","}","<",">","^","~","`","|"],["\\","$","€","£","₴","°","§","©","®","™"],["…","«","»","–","—","•","№","±","×","÷"]]
    })
    property string lang: "uk"
    // interface language of our apps (hub → «Мова», settings myhome/uiLang; set from main.qml) — labels and hints only
    property string uiLang: "uk"
    readonly property var tr: ({
        en: ["space", "Done", "Shift · twice — Caps", "Delete · hold — all", "◀ cursor", "cursor ▶", "Back — hide"],
        ru: ["пробел", "Готово", "Shift · дважды — Caps", "Стереть · удержать — всё", "◀ курсор", "курсор ▶", "Back — скрыть"],
        nl: ["spatie", "Klaar", "Shift · twee keer — Caps", "Wissen · vasthouden — alles", "◀ cursor", "cursor ▶", "Back — verbergen"],
        de: ["Leerzeichen", "Fertig", "Shift · zweimal — Caps", "Löschen · halten — alles", "◀ Cursor", "Cursor ▶", "Back — ausblenden"],
        fr: ["espace", "Terminé", "Maj · deux fois — Verr. maj", "Effacer · maintenir — tout", "◀ curseur", "curseur ▶", "Back — masquer"],
        es: ["espacio", "Hecho", "Mayús · dos veces — Bloq Mayús", "Borrar · mantener — todo", "◀ cursor", "cursor ▶", "Back — ocultar"],
        it: ["spazio", "Fatto", "Maiusc · due volte — Bloc Maiusc", "Cancella · tieni premuto — tutto", "◀ cursore", "cursore ▶", "Back — nascondi"],
        pl: ["spacja", "Gotowe", "Shift · dwa razy — Caps", "Usuń · przytrzymaj — wszystko", "◀ kursor", "kursor ▶", "Back — ukryj"],
        pt: ["espaço", "Concluído", "Shift · duas vezes — Caps", "Apagar · manter — tudo", "◀ cursor", "cursor ▶", "Back — ocultar"],
        uk: ["пробіл", "Готово", "Shift · двічі — Caps", "Стерти · утримати — усе", "◀ курсор", "курсор ▶", "Back — сховати"]
    })
    function t(i) { var a = tr[uiLang] || tr.uk; return a[i]; }
    property string mode: "uk"
    property bool shift: false
    property bool caps: false
    property double lastShift: 0
    property var rows: []
    property int r: 0
    property int c: 0
    property bool hl: true
    property double lastEnter: 0
    property int bsRun: 0
    property double bsLast: 0
    property double greenT: 0
    property bool greenCleared: false
    property int flash: 0

    readonly property real pad: 18 * sc
    readonly property real gap: 10 * sc
    readonly property real keyH: 74 * sc
    readonly property real hintH: 42 * sc
    readonly property real innerW: panel.width - 2 * pad

    width: Screen.width
    height: Math.round(pad * 2 + 4 * keyH + 3 * gap + hintH + 28 * sc)

    function letters() { return mode === "uk" || mode === "ru" || mode === "en"; }
    function build() {
        var base = lay[mode].map(function (row) { return row.map(function (ch) { return { t: "ch", v: ch, w: 1 }; }); });
        base[0] = base[0].concat([{ t: "bs", v: "", w: 1.6 }]);
        var L = letters();
        var bottom = [
            L ? { t: "shift", v: caps ? "⇧ CAPS" : "⇧ Aa", w: 1.5 } : { t: "sym", v: mode === "sym" ? "123" : "#+=", w: 1.5 },
            { t: "mode", v: L ? "123" : (lang === "en" ? "ABC" : "АБВ"), w: 1.3 },
            { t: "lang", v: ({ uk: "УКР", ru: "РУС", en: "ENG" })[lang] || "ENG", w: 1.3 },
            { t: "sp", v: kb.t(0), w: (url && L) ? 3.1 : 6.6 },
            { t: "ok", v: kb.t(1), w: 2.1 }
        ];
        if (url && L) bottom.splice(3, 0, { t: "txt", v: "/", w: 1 }, { t: "txt", v: "@", w: 1 }, { t: "txt", v: ".com", w: 1.5 });
        base.push(bottom);
        rows = base;
        if (r >= rows.length) r = rows.length - 1;
        if (c >= rows[r].length) c = rows[r].length - 1;
    }
    function reset() {
        shift = false; caps = false; mode = numeric ? "num" : lang; r = numeric ? 0 : 0; c = 0; hl = true; bsRun = 0;
        build();
    }
    function rowSum(row) { var s = 0; for (var i = 0; i < row.length; i++) s += row[i].w; return s; }
    function keyX(ri, ci) { var row = rows[ri], u = (innerW - gap * (row.length - 1)) / rowSum(row), x = 0; for (var i = 0; i < ci; i++) x += row[i].w * u + gap; return x; }
    function keyW(ri, ci) { var row = rows[ri]; return (innerW - gap * (row.length - 1)) / rowSum(row) * row[ci].w; }
    function label(k) { if (k.t === "ch") return (shift || caps) ? k.v.toUpperCase() : k.v; return k.v; }

    function toggleShift() {
        var now = Date.now();
        if (mode === "num" || mode === "sym") { mode = mode === "sym" ? "num" : "sym"; build(); return; }
        if (caps) { caps = false; shift = false; }
        else if (shift && now - lastShift < 450) { caps = true; shift = false; }
        else shift = !shift;
        lastShift = now; build();
    }
    function press(k) {
        if (k.t === "ch") { sendText(label(k)); if (shift) { shift = false; build(); } }
        else if (k.t === "txt") sendText(k.v);
        else if (k.t === "sp") sendKey("57", evType);
        else if (k.t === "bs") {
            var now = Date.now(); bsRun = (now - bsLast < 1500) ? bsRun + 1 : 1; bsLast = now;
            if (bsRun === 4) flash++;
            sendKey("14", evType);
        }
        else if (k.t === "shift" || k.t === "sym") toggleShift();
        else if (k.t === "lang") { lang = ({ uk: "ru", ru: "en", en: "uk" })[lang] || "uk"; if (letters()) mode = lang; build(); }
        else if (k.t === "mode") { mode = (mode === "num" || mode === "sym") ? lang : "num"; build(); }
        else if (k.t === "ok") sendKey("28", evType);
    }
    function vert(d) {
        var cx = keyX(r, c) + keyW(r, c) / 2;
        r = (r + d + rows.length) % rows.length;
        var best = 0, bd = 1e9;
        for (var j = 0; j < rows[r].length; j++) { var dd = Math.abs(keyX(r, j) + keyW(r, j) / 2 - cx); if (dd < bd) { bd = dd; best = j; } }
        c = best;
    }
    function colour(ev) {
        var k = ev.key, n = ev.nativeScanCode;
        if (k === Qt.Key_Red    || n === 398 || n === 406) return 1;
        if (k === Qt.Key_Green  || n === 399 || n === 407) return 2;
        if (k === Qt.Key_Yellow || n === 400 || n === 408) return 3;
        if (k === Qt.Key_Blue   || n === 401 || n === 409) return 4;
        return 0;
    }

    // key handling lives in a function so LG's tree can forward its events here (see the proxy in NormalKeyboard)
    Keys.onPressed: handleKey(event)
    Keys.onReleased: handleRelease(event)
    // colour keys arrive from our surface-manager key filter through the settings value myhome/vkbKey
    property string lastRemote: ""
    function remoteColour(v) {
        if (!enabled || !v || v === lastRemote) return;
        lastRemote = v;
        var n = String(v).split(":")[0];
        if (n === "red") toggleShift();
        else if (n === "green") press({ t: "bs" });
        else if (n === "greenhold") clearAll();
        else if (n === "yellow") cursorMove(0);
        else if (n === "blue") cursorMove(1);
    }
    function handleRelease(event) { if (colour(event)) event.accepted = true; }
    function handleKey(event) {
        evType = 2;
        var k = event.key, col = colour(event);
        var isOk = (k === Qt.Key_Execute || k === Qt.Key_Return || k === Qt.Key_Enter || k === Qt.Key_Select);
        var isArrow = (k === Qt.Key_Left || k === Qt.Key_Right || k === Qt.Key_Up || k === Qt.Key_Down);
        if (col) {
            event.accepted = true;
            if (col === 1 && !event.isAutoRepeat) toggleShift();
            else if (col === 2) {
                if (!event.isAutoRepeat) { greenT = Date.now(); greenCleared = false; press({ t: "bs" }); }
                else if (!greenCleared && Date.now() - greenT > 600) { greenCleared = true; clearAll(); }
            }
            else if (col === 3) cursorMove(0);
            else if (col === 4) cursorMove(1);
            return;
        }
        if (!isOk && !isArrow) { console.warn("MYHOME-KB key=" + k + " scan=" + event.nativeScanCode); return; }   // Back etc. → system
        event.accepted = true;
        if (!hl) { hl = true; return; }   // курсор пульта погасив виділення — перша кнопка лише повертає його
        if (k === Qt.Key_Left) c = (c - 1 + rows[r].length) % rows[r].length;
        else if (k === Qt.Key_Right) c = (c + 1) % rows[r].length;
        else if (k === Qt.Key_Up) vert(-1);
        else if (k === Qt.Key_Down) vert(1);
        else if (isOk && !event.isAutoRepeat) press(rows[r][c]);
        else if (isOk && rows[r][c].t === "bs" && !greenCleared && Date.now() - greenT > 600) { greenCleared = true; clearAll(); }
        if (isOk && !event.isAutoRepeat && rows[r][c] && rows[r][c].t === "bs") { greenT = Date.now(); greenCleared = false; }
    }

    Timer { id: leaveT; interval: 80; property double t0: 0; onTriggered: if (kb.lastEnter < t0) kb.hl = false }
    function ptrLeave() { leaveT.t0 = Date.now(); leaveT.restart(); }

    Rectangle {
        id: panel
        width: Math.min(1560 * sc, kb.width - 80 * sc)
        height: pad * 2 + 4 * keyH + 3 * gap + hintH
        anchors.horizontalCenter: parent.horizontalCenter
        y: 0
        radius: 26 * sc
        color: "#FA16161C"
        border.color: "#24FFFFFF"
        border.width: Math.max(1, sc)

        Column {
            x: pad; y: pad
            spacing: gap
            Repeater {
                model: kb.rows.length
                delegate: Item {
                    id: rowItem
                    property int ri: index
                    property var rowData: kb.rows[index] || []
                    width: kb.innerW; height: kb.keyH
                    Repeater {
                        model: rowItem.rowData.length
                        delegate: Rectangle {
                            id: key
                            property int ci: index
                            property var k: rowItem.rowData[index] || ({ t: "ch", v: "", w: 1 })
                            property bool fn: k.t !== "ch" && k.t !== "txt"
                            property bool foc: kb.hl && kb.r === rowItem.ri && kb.c === ci
                            property bool lit: (k.t === "shift" && kb.caps)
                            x: kb.keyX(rowItem.ri, ci); width: kb.keyW(rowItem.ri, ci); height: kb.keyH
                            radius: 14 * kb.sc
                            scale: foc ? 1.07 : 1
                            z: foc ? 2 : 1
                            color: foc || lit ? "#FFFFFF" : (k.t === "ok" ? "#E11D2A" : (k.t === "shift" && kb.shift ? "#3B3B48" : (fn ? "#1D1D24" : "#2A2A33")))
                            Behavior on scale { NumberAnimation { duration: 90 } }
                            Text {
                                anchors.centerIn: parent
                                visible: key.k.t !== "bs"
                                text: kb.label(key.k)
                                font.family: kb.fontFamily
                                font.pixelSize: (key.fn ? 24 : 32) * kb.sc
                                font.weight: Font.Medium
                                color: key.foc || key.lit ? (key.k.t === "ok" ? "#E11D2A" : "#111111") : (key.fn && key.k.t !== "ok" ? "#CFCFD6" : "#EEEEEE")
                            }
                            Canvas {   // ⌫ (the TV font has no such glyph)
                                id: bsIcon
                                visible: key.k.t === "bs"
                                anchors.centerIn: parent
                                width: 46 * kb.sc; height: 32 * kb.sc
                                property color ink: key.foc ? "#111111" : "#CFCFD6"
                                onInkChanged: requestPaint()
                                onVisibleChanged: requestPaint()
                                onPaint: {
                                    var g = getContext("2d"), s = width / 46; g.reset();
                                    g.strokeStyle = ink; g.lineWidth = 3 * s; g.lineJoin = "round"; g.lineCap = "round";
                                    g.beginPath(); g.moveTo(15 * s, 3 * s); g.lineTo(42 * s, 3 * s); g.lineTo(42 * s, 29 * s); g.lineTo(15 * s, 29 * s); g.lineTo(3 * s, 16 * s); g.closePath(); g.stroke();
                                    g.beginPath(); g.moveTo(23 * s, 10 * s); g.lineTo(35 * s, 22 * s); g.moveTo(35 * s, 10 * s); g.lineTo(23 * s, 22 * s); g.stroke();
                                }
                            }
                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                property bool held: false
                                onEntered: { kb.lastEnter = Date.now(); kb.hl = true; kb.r = rowItem.ri; kb.c = key.ci; }
                                onExited: kb.ptrLeave()
                                onPressAndHold: { if (key.k.t === "bs") { held = true; kb.clearAll(); } }
                                onClicked: { if (held) { held = false; return; } kb.hl = true; kb.r = rowItem.ri; kb.c = key.ci; kb.evType = 1; kb.press(key.k); kb.evType = 2; }
                            }
                        }
                    }
                }
            }
            Row {   // legend
                height: kb.hintH
                spacing: 30 * kb.sc
                anchors.horizontalCenter: parent.horizontalCenter
                Repeater {
                    model: [["#E5323C", kb.t(2)], ["#2FB24C", kb.t(3)], ["#E8C21B", kb.t(4)], ["#2D6FE0", kb.t(5)], ["", kb.t(6)]]
                    delegate: Row {
                        id: hintItem
                        spacing: 9 * kb.sc
                        anchors.verticalCenter: parent.verticalCenter
                        Rectangle { visible: modelData[0] !== ""; width: 16 * kb.sc; height: width; radius: width / 2; color: modelData[0] || "transparent"; anchors.verticalCenter: parent.verticalCenter }
                        Text {
                            id: hintTx
                            text: modelData[1]; font.family: kb.fontFamily; font.pixelSize: 20 * kb.sc
                            color: modelData[0] === "" ? "#77777F" : "#B9B9C2"
                            anchors.verticalCenter: parent.verticalCenter
                            SequentialAnimation on scale {   // підказка «утримати — усе» блимає після кількох стирань поспіль
                                id: flashAnim; running: false; loops: 3
                                NumberAnimation { to: 1.18; duration: 350 } NumberAnimation { to: 1; duration: 350 }
                            }
                            Connections { target: kb; onFlashChanged: if (index === 1) flashAnim.restart() }
                        }
                    }
                }
            }
        }
        MouseArea { anchors.fill: parent; z: -1; hoverEnabled: true; acceptedButtons: Qt.NoButton }
    }
    Component.onCompleted: build()
}
