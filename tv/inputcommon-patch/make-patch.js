// Builds patched copies of 2 QML files of com.webos.app.inputcommon (the native HDMI/AV input app,
// /usr/bin/com.webos.app.inputcommon, run as com.webos.app.hdmiN) from the STOCK files.
// Usage: node make-patch.js <stockQmlDir> <outQmlDir>
//  1. BgViewLayer/Screensaver.qml: LG's no-signal photo slideshow is hidden and handed off to OUR
//     system saver (com.webos.app.screensaver = /media/developer/myhome-saver web slideshow).
//     Launch when LG's slideshow would start, close when it stops while the input app is foreground.
//  2. MainViewLayer/InputBanner/SimpleBanner.qml: the "HDMI 2 / Ігрова консоль" banner becomes a dark
//     launcher-style card (white text, white focus ring) instead of LG's grey bitmap background.
const fs = require('fs'), path = require('path');
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node make-patch.js <stockQmlDir> <outQmlDir>'); process.exit(1); }

function patch(rel, reps) {
  let s = fs.readFileSync(path.join(src, rel), 'utf8');
  for (const [from, to, n] of reps) {
    const cnt = s.split(from).length - 1;
    if (cnt !== n) throw new Error(`${rel}: expected ${n}x ${JSON.stringify(from)}, found ${cnt}`);
    s = s.split(from).join(to);
  }
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), s);
  console.log('patched', rel);
}

const SAVER = `    // ===== MYHOME: hand the no-signal slideshow to our system saver (com.webos.app.screensaver) =====
    property bool mhPhoto: isPhotoRunning
    property bool mhSaverUp: false
    onMhPhotoChanged: mhDebounce.restart()
    Timer {
        id: mhDebounce
        interval: 2000
        onTriggered: {
            if (screensaverRoot.isPhotoRunning) {
                // only while this input app is foreground (saver exit may have sent the user to home)
                if (!screensaverRoot.mhSaverUp && screensaverRoot.activated) {
                    logger.i("MYHOME saver launch");
                    mhLaunch.callService({"id": "com.webos.app.screensaver", "params": {"reason": "nosignal"}});
                    screensaverRoot.mhSaverUp = true;
                }
            } else if (screensaverRoot.mhSaverUp && screensaverRoot.activated) {
                logger.i("MYHOME saver close");
                mhClose.callService({"id": "com.webos.app.screensaver"});
                screensaverRoot.mhSaverUp = false;
            }
        }
    }
    // Our saver window doesn't get key focus (hdmiN keeps it), so any remote key reaching this app
    // closes our saver; after 2 min without keys it comes back if there's still no signal.
    function mhOnKey() {
        if (screensaverRoot.mhSaverUp) {
            logger.i("MYHOME saver close (key)");
            mhClose.callService({"id": "com.webos.app.screensaver"});
            screensaverRoot.mhSaverUp = false;
        }
        mhIdle.restart();
    }
    Timer {
        id: mhIdle
        interval: 120000
        onTriggered: mhDebounce.restart()
    }
    // Keys usually go to the saver window, which closes itself (saver/index.html bye()).
    // Watch SAM's running list: when our saver disappears, re-arm the 2-min comeback timer.
    MHS.Service {
        id: mhRunning
        appId: systemProperties.appId
        service: "com.webos.applicationManager"
        method: "running"
        onCallResponse: {
            var up = false;
            var apps = (response && response.running) ? response.running : [];
            for (var i = 0; i < apps.length; i++) if (apps[i].id === "com.webos.app.screensaver") up = true;
            if (!up && screensaverRoot.mhSaverUp) {
                logger.i("MYHOME saver gone (dismissed)");
                screensaverRoot.mhSaverUp = false;
                // still no signal -> don't leave the user on a black screen: go to our home
                if (screensaverRoot.isPhotoRunning && screensaverRoot.activated)
                    mhLaunch.callService({"id": "com.webos.app.home"});
                mhIdle.restart();
            }
        }
    }
    Timer {
        // (Screensaver.qml already has a Component.onCompleted, so subscribe from a one-shot timer)
        interval: 3000
        running: true
        onTriggered: mhRunning.callService({"subscribe": true})
    }
    Connections {
        target: screensaverRoot
        onActivatedChanged: if (screensaverRoot.activated) mhDebounce.restart()
    }
    MHS.Service {
        id: mhLaunch
        appId: systemProperties.appId
        service: "com.webos.applicationManager"
        method: "launch"
    }
    MHS.Service {
        id: mhClose
        appId: systemProperties.appId
        service: "com.webos.applicationManager"
        method: "closeByAppId"
    }
    // ===== /MYHOME =====

    PhotoSlide {

        id: photoSlide

        photoModel: noSignalPhotoModel
        opacity: 0   // MYHOME: LG photos hidden; our saver window covers the screen
    }`;

patch('UserInterfaceLayer/Containers/BgViewLayer/Screensaver.qml', [
  ['import "../../../Constants.js" as C\n', 'import "../../../Constants.js" as C\nimport WebOSServices 1.0 as MHS\n', 1],
  ['    PhotoSlide {\n\n        id: photoSlide\n\n        photoModel: noSignalPhotoModel\n    }', SAVER, 1],
  ['    function checkToggleGuideArea (keyCode) {\n', '    function checkToggleGuideArea (keyCode) {\n        mhOnKey();   // MYHOME\n', 1],
]);

patch('UserInterfaceLayer/Containers/MainViewLayer/InputBanner/SimpleBanner.qml', [
  ['        id: zappingBg\n\n        width: parent.width\n        height: parent.height\n        anchors.left: parent.left\n',
   '        id: zappingBg\n\n        width: parent.width\n        height: parent.height\n        anchors.left: parent.left\n        opacity: 0   // MYHOME: LG bitmap bg hidden, see mhCard\n', 1],
  ['    Item {\n\n        id: zappingBg\n',
   `    Rectangle {
        // MYHOME: launcher-style card
        id: mhCard
        anchors.fill: parent
        visible: root.needFocusHandle || root.displayOnlyZapping
        radius: 20
        color: root.hasFocus ? "#23232c" : "#16161c"
        opacity: 0.96
        border.width: root.hasFocus ? 4 : 2
        border.color: root.hasFocus ? "#ffffff" : "#2effffff"
    }

    Item {

        id: zappingBg
`, 1],
  ['needFocusHandle ? styleSheet.banner.inputFocusedColor : styleSheet.banner.inputColor', '"#ffffff"', 2],
]);

// The launch/OK banner background lives in InputBanner.qml (bannerBg, LG bitmaps) — seen on PS5 power-on.
patch('UserInterfaceLayer/Containers/MainViewLayer/InputBanner/InputBanner.qml', [
  ['        id: bannerBg\n\n        visible: interfaces[C.NAME_INBANNER] && interfaces[C.NAME_INBANNER].isOkBanner\n        anchors.fill: bannerRow\n',
   `        id: bannerBg

        visible: interfaces[C.NAME_INBANNER] && interfaces[C.NAME_INBANNER].isOkBanner
        anchors.fill: bannerRow

        Rectangle {
            // MYHOME: launcher-style card instead of LG bitmaps
            anchors.fill: parent
            radius: 20
            color: "#16161c"
            opacity: 0.96
            border.width: 2
            border.color: "#2effffff"
        }
`, 1],
  ['            source: root.visible ? styleSheet.banner.middleBg : ""\n', '            source: root.visible ? styleSheet.banner.middleBg : ""\n            opacity: 0   // MYHOME\n', 1],
  ['            source: root.visible ? styleSheet.banner.rightBg : ""\n', '            source: root.visible ? styleSheet.banner.rightBg : ""\n            opacity: 0   // MYHOME\n', 1],
]);

// 3. Interfaces/Banner/BannerInterfaces.qml: NO LG input banners at all (launch "PS5 / HDMI 1" card, OK-key banner,
//    zapping banner…) — user: "не нужны" (2026-11-22). show() is the single entry point; returning false is the
//    stock "interface disabled" path.
patch('Interfaces/Banner/BannerInterfaces.qml', [
  ['    function show (mode) {\n',
   '    function show (mode) {\n' +
   '        if (mode !== C.V_STATE_HIDE) { logger.i("MYHOME banner suppressed", {mode}); return false; }   // MYHOME\n', 1],
]);
