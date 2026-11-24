// My Home: surface-manager key filter — ONE place for all "system" remote keys we take over.
// Loaded via Qt.include() by StarfishKeyFilterLoader (globals applicationManager / WebOS / KeyPolicy / lunaCall
// come from the compositor shell). Inserted FIRST in the keyFilters chain (before preProcess long-press handling).
//   HOME     (Qt.Key_Super_L)               -> foreground our home                 (was: node daemon, hook 31)
//   SETTINGS (Key_webOS_Settings)           -> our settings overlay               (LG quick settings never open)
//   SOURCE   (Key_webOS_InputSource)        -> our «Джерело сигналу»              (LG input picker never opens)
//   ⋯        (Key_webOS_ScreenRemote, 994)  -> delivered straight to the focused window (our home: short = menu,
//                                              long 2s = edit mode); LG «Додаткові дії» / long-press «Звуковий опис»
//                                              never run (was: keyaction patch hook 35 + tvhotkey QML patch hook 34)
//   MIC      (Key_webOS_Voice)              -> our hub search (LG voice assistant never starts; 2026-11-21)
//   GUIDE    (Key_webOS_TVGuide/ProgramList) -> our IPTV app com.user.iptv «Канали» (2026-11-22)
//   POWER    never reaches key filters (LG C++ eats it) -> hold menu lives in deploy/poweron/pwrkey.py
//   «Кнопки»: user bindings from the hub settings (see myHomeBindKeys) — digits short/hold + any learned key
//   BACK and everything else -> untouched (NextPolicy).
// Installed by deploy/init.d/36-keyfilter-patch.sh. Revert: umount /etc/configd/layers/base/com.webos.surfacemanager.json,
// luna com.webos.service.config/reconfigure '{}', systemctl restart surface-manager-daemon.

function init() {
    console.info("[myhome-keys] init");
    myHomeBindsInit();
}

// ---- «Кнопки» (hub settings → Кнопки): the user's own key bindings ----
// settings category "myhome":
//   keyBinds  = JSON string { "d0".."d9": short press of a digit, "k<qtKeyCode>": any other key } → action
//               action = "app:<appId>" | "hub:<''|settings|inputs|search>" | "none" (swallow the key)
//   keyLearn  = "<ms>" — the hub waits for «натисни кнопку»: the next non-navigation key (within 30 s) is NOT acted on,
//               it is reported back as keyLearned = "<qtKeyCode>|<webOS key name>|<ms>"
// Hold of a digit = LG's own Quick Access (category "option", magicNum1..9 = {id, params}); we only take it over for a
// digit that ALSO has a short binding (then we see the press first and must tell short from hold ourselves).
// Digits stay untouched in «Канали» (channel numbers) and while the on-screen keyboard is up.
var myHomeBinds = {}, myHomeMagic = {}, myHomeLearnAt = 0, myHomeFg = "", myHomeInited = false;
var myHomeDigit = null, myHomeHoldTimer = -1, myHomeLearnKey = -1;
function myHomeBindsInit() {
    if (myHomeInited) return;
    myHomeInited = true;
    try {
        lunaCall.subscribe('com.webos.settingsservice', '/getSystemSettings',
            JSON.stringify({"category": "myhome", "keys": ["keyBinds", "keyLearn"], "subscribe": true}), function (payload) {
                var r = {}; try { r = JSON.parse(payload); } catch (e) {}
                var st = r.settings || {};
                if ("keyBinds" in st) { try { myHomeBinds = JSON.parse(st.keyBinds || "{}") || {}; } catch (e) { myHomeBinds = {}; } }
                if ("keyLearn" in st) myHomeLearnAt = parseInt(st.keyLearn, 10) || 0;
            }, true);
        var mk = []; for (var i = 1; i <= 9; i++) mk.push("magicNum" + i);
        lunaCall.subscribe('com.webos.settingsservice', '/getSystemSettings',
            JSON.stringify({"category": "option", "keys": mk, "subscribe": true}), function (payload) {
                var r = {}; try { r = JSON.parse(payload); } catch (e) {}
                var st = r.settings || {};
                for (var k in st) myHomeMagic[k.replace("magicNum", "")] = st[k];
            }, true);
        lunaCall.subscribe('com.webos.applicationManager', '/getForegroundAppInfo',
            JSON.stringify({"subscribe": true}), function (payload) {
                var r = {}; try { r = JSON.parse(payload); } catch (e) {}
                if (r.appId !== undefined) myHomeFg = r.appId;
            }, true);
    } catch (e) { console.warn("[myhome-keys] binds subscribe failed: " + e); }
}
function myHomeKeyName(key) {
    // WebOS key enums can't be enumerated here (for..in gives nothing) → check the known remote buttons one by one
    var names = ["Netflix", "Amazon", "Disney", "DisneyPlus", "LGChannels", "Rakuten", "Hulu", "Youtube", "YouTube", "Ivi",
                 "ScreenRemote", "Settings", "InputSource", "Voice", "TVGuide", "ProgramList", "Recent", "Favorite", "LiveTVMenu",
                 "InputTV", "AspectRatio", "AudioDescription", "Info", "Multikey", "Simplink", "ChannelUp", "ChannelDown",
                 "ChannelDash", "Lighting", "Shade", "LiveZoom", "TER", "STBMenu", "RecordList", "Search", "Magnifier"];
    for (var i = 0; i < names.length; i++) {
        try { if (WebOS["Key_webOS_" + names[i]] === key) return names[i]; } catch (e) {}
    }
    return "";
}
function myHomeRun(action) {
    if (!action || action === "none") return true;
    try {
        if (typeof action === "object") {             // LG Quick Access slot
            if (!action.id) return false;
            applicationManager.launch(action.id, JSON.stringify(action.params || {}));
            return true;
        }
        if (action.indexOf("app:") === 0) { applicationManager.launch(action.slice(4), JSON.stringify({})); return true; }
        if (action.indexOf("hub:") === 0) return launchHome(action.slice(4));
    } catch (e) { console.warn("[myhome-keys] bind run failed: " + e); }
    return false;
}
function myHomeKbdUp() { try { return keyboard.visible; } catch (e) { return false; } }
function myHomeBindKeys(key, pressed, autoRepeat) {
    if (!myHomeInited) myHomeBindsInit();
    // learning: report the key to the hub instead of acting on it
    if (myHomeLearnKey === key) { if (!pressed) myHomeLearnKey = -1; return true; }
    if (myHomeLearnAt && Date.now() - myHomeLearnAt < 30000 && pressed && !autoRepeat) {
        var nav = [Qt.Key_Left, Qt.Key_Right, Qt.Key_Up, Qt.Key_Down, Qt.Key_Return, Qt.Key_Enter, Qt.Key_Select,
                   Qt.Key_Escape, Qt.Key_Back, Qt.Key_Super_L, Qt.Key_VolumeUp, Qt.Key_VolumeDown, Qt.Key_VolumeMute];
        try { nav.push(WebOS.Key_webOS_Back, WebOS.Key_webOS_Red, WebOS.Key_webOS_Green, WebOS.Key_webOS_Yellow, WebOS.Key_webOS_Blue); } catch (e) {}
        if (nav.indexOf(key) < 0 && !(key >= Qt.Key_0 && key <= Qt.Key_9)) {
            myHomeLearnAt = 0; myHomeLearnKey = key;
            var kn = ""; try { kn = myHomeKeyName(key); } catch (e) {}
            try { lunaCall.send('com.webos.settingsservice', '/setSystemSettings', JSON.stringify({"category": "myhome",
                  "settings": {"keyLearn": "0", "keyLearned": key + "|" + kn + "|" + Date.now()}})); } catch (e) {}
            return true;
        }
    }
    // digits: short = our binding, hold = LG Quick Access slot
    if (key >= Qt.Key_0 && key <= Qt.Key_9) {
        var n = key - Qt.Key_0;
        if (myHomeDigit && myHomeDigit.key === key) {          // the digit we already took
            if (pressed) return true;
            if (myHomeHoldTimer >= 0) { genericTimer.cancel(myHomeHoldTimer); myHomeHoldTimer = -1; }
            var d = myHomeDigit; myHomeDigit = null;
            if (!d.held) myHomeRun(myHomeBinds["d" + n]);
            return true;
        }
        if (!pressed || autoRepeat || !myHomeBinds["d" + n] || myHomeFg === "com.user.iptv" || myHomeKbdUp()) return false;
        myHomeDigit = {key: key, held: false};
        myHomeHoldTimer = genericTimer.set(1000, function () {
            myHomeHoldTimer = -1;
            if (!myHomeDigit) return;
            myHomeDigit.held = true;
            myHomeRun(myHomeMagic[String(n)]);
        });
        return true;
    }
    var b = myHomeBinds["k" + key];
    if (!b) return false;
    if (pressed && !autoRepeat) myHomeRun(b);
    return true;
}

function launchHome(open) {
    var p = open ? {"open": open, "ts": Date.now()} : {};
    try {
        applicationManager.launch("com.webos.app.home", JSON.stringify(p));
        return true;
    } catch (e) {
        console.warn("[myhome-keys] launch failed: " + e);
        return false;
    }
}

function wake(key, pressed) {
    // we sit before systemUi.handleScreenSaver, so wake the system screensaver ourselves for keys we claim
    if (pressed) { try { screenSaver.wakeUp(key); } catch (e) {} }
}

// While the on-screen keyboard (our QML inside LG's Maliit plugin) is up, the IME never receives the colour keys —
// LG's C++ forwards only navigation keys and passes the rest to the app. So we take them here and hand them to the
// keyboard through a settings value it subscribes to (category "myhome", key "vkbKey"; value "<name>:<time>").
var myHomeGreenDown = 0, myHomeGreenHoldSent = false;
function myHomeVkbColour(key, pressed, autoRepeat) {
    var name = key === WebOS.Key_webOS_Red ? "red" : key === WebOS.Key_webOS_Green ? "green" :
               key === WebOS.Key_webOS_Yellow ? "yellow" : key === WebOS.Key_webOS_Blue ? "blue" : "";
    if (!name) return false;
    var vis = false;
    try { vis = keyboard.visible; } catch (e) {}
    if (!vis) return false;
    var send = null, now = Date.now();
    if (pressed && !autoRepeat) {
        send = name;
        if (name === "green") { myHomeGreenDown = now; myHomeGreenHoldSent = false; }
    } else if (pressed && autoRepeat && name === "green" && !myHomeGreenHoldSent && now - myHomeGreenDown > 600) {
        send = "greenhold"; myHomeGreenHoldSent = true;
    }
    if (send) {
        try { lunaCall.send('com.webos.settingsservice', '/setSystemSettings',
                            JSON.stringify({"category": "myhome", "settings": {"vkbKey": send + ":" + now}})); }
        catch (e) { console.warn("[myhome-keys] vkb colour send failed: " + e); }
    }
    return true;
}

function handleMyHomeKeys(key, pressed, autoRepeat, deviceId) {
    if (myHomeVkbColour(key, pressed, autoRepeat))
        return KeyPolicy.Accepted;
    var bound = false;
    try { bound = myHomeBindKeys(key, pressed, autoRepeat); } catch (e) { console.warn("[myhome-keys] binds: " + e); }
    if (bound) {
        wake(key, pressed);
        return KeyPolicy.Accepted;
    }
    // GUIDE -> our IPTV app «Канали» (com.user.iptv); LG's programme guide never opens (2026-11-22)
    // + the TV / Live-TV-menu keys: «Канали» replaces LG's Live TV everywhere
    if (key === WebOS.Key_webOS_TVGuide || key === WebOS.Key_webOS_ProgramList ||
        key === WebOS.Key_webOS_InputTV || key === WebOS.Key_webOS_LiveTVMenu) {
        wake(key, pressed);
        if (pressed && !autoRepeat) {
            try { applicationManager.launch("com.user.iptv", JSON.stringify({"ts": Date.now()})); }
            catch (e) { console.warn("[myhome-keys] iptv launch failed: " + e); return KeyPolicy.NextPolicy; }
        }
        return KeyPolicy.Accepted;
    }
    var ours = (key === WebOS.Key_webOS_ScreenRemote || key === Qt.Key_Super_L ||
                key === WebOS.Key_webOS_Settings || key === WebOS.Key_webOS_LocalSettings ||
                key === WebOS.Key_webOS_InputSource || key === WebOS.Key_webOS_LocalInputSource ||
                key === WebOS.Key_webOS_Voice);
    if (!ours)
        return KeyPolicy.NextPolicy;
    wake(key, pressed);

    // ⋯ : never let LG handle it (no tvhotkey panel, no long-press audio description) — the app/home gets press+release
    if (key === WebOS.Key_webOS_ScreenRemote)
        return KeyPolicy.NotAccepted;

    var open = null;
    if (key === Qt.Key_Super_L)
        open = "";
    else if (key === WebOS.Key_webOS_Settings || key === WebOS.Key_webOS_LocalSettings)
        open = "settings";
    else if (key === WebOS.Key_webOS_InputSource || key === WebOS.Key_webOS_LocalInputSource)
        open = "inputs";
    else if (key === WebOS.Key_webOS_Voice)
        open = "search";
    if (open === null)
        return KeyPolicy.NextPolicy;

    if (pressed && !autoRepeat) {
        if (!launchHome(open))
            return KeyPolicy.NextPolicy;   // fall back to stock behaviour if launch is impossible
    }
    return KeyPolicy.Accepted;
}
