// usage: node usbalert-patch.js <stock AlertView.qml> <out AlertView.qml>
// Replaces LG's USB «what do you want to do» alert (attachedstoragemanager, 2+ buttons → its buttons make
// the storage manager launch LG Media) with ours: «Флешку підключено» + «Відкрити у Файлах» / «Закрити».
const fs = require('fs'); let s = fs.readFileSync(process.argv[2], 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('not unique/missing: ' + a.slice(0, 60)); s = s.replace(a, b); }

const FN = `
    // My Home: LG's USB plug-in alert → ours (open the stick in «Файли», not in LG Media)
    function myHomeFixAlert(info) {
        try {
            var s = JSON.stringify(info || {});
            if (s.indexOf("attachedstoragemanager") < 0 || !info.buttons || info.buttons.length < 2) return info;
            var o = {};
            for (var k in info) o[k] = info[k];
            // language = LG's UI locale (our hub switches it together with «Мова»)
            var T = {
                uk: ["Флешку підключено", "Флешку підключено. Відкрити її у «Файлах»?", "Відкрити", "Закрити"],
                ru: ["Флешка подключена", "Флешка подключена. Открыть её в «Файлах»?", "Открыть", "Закрыть"],
                en: ["USB drive connected", "USB drive connected. Open it in «Files»?", "Open", "Close"],
                nl: ["USB-stick aangesloten", "USB-stick aangesloten. Openen in «Bestanden»?", "Openen", "Sluiten"],
                de: ["USB-Stick verbunden", "USB-Stick verbunden. In «Dateien» öffnen?", "Öffnen", "Schließen"],
                fr: ["Clé USB connectée", "Clé USB connectée. L'ouvrir dans «Fichiers» ?", "Ouvrir", "Fermer"],
                es: ["Memoria USB conectada", "Memoria USB conectada. ¿Abrirla en «Archivos»?", "Abrir", "Cerrar"],
                it: ["Chiavetta USB collegata", "Chiavetta USB collegata. Aprirla in «File»?", "Apri", "Chiudi"],
                pl: ["Podłączono pendrive'a", "Podłączono pendrive'a. Otworzyć go w «Plikach»?", "Otwórz", "Zamknij"],
                pt: ["Pen USB ligada", "Pen USB ligada. Abri-la em «Ficheiros»?", "Abrir", "Fechar"]
            };
            var lc = ""; try { lc = String(NLocaleService.currentLocale || "").slice(0, 2); } catch (e) {}
            var t = T[lc] || T.uk;
            o.title = t[0];
            o.message = t[1];
            o.readable = o.title + ". " + o.message;
            o.iconUrl = ""; o.thumbnailPath = "";
            o.onCloseAction = null;
            delete o.checkButton;
            o.buttons = [
                { label: t[2], focus: true,
                  action: { serviceURI: "luna://com.webos.applicationManager", serviceMethod: "/launch",
                            launchParams: { id: "com.user.explorer", params: { usb: true } } } },
                { label: t[3] }
            ];
            console.info("MyHome: USB alert replaced; original:", s);
            return o;
        } catch (e) { return info; }
    }
`;
// insert the function right before the ListView that holds the delegate (first "delegate: Component {")
const di = s.indexOf('        delegate: Component {');
if (di < 0) throw new Error('delegate not found');
// put the function at the root item level: find the root "id: root" line and insert after it
const ri = s.indexOf('id: root');
if (ri < 0 || ri > di) throw new Error('root id not found before delegate');
const rl = s.indexOf('\n', ri) + 1;
s = s.slice(0, rl) + FN + s.slice(rl);

// inside the delegate, read everything through the fixed info object
const d0 = s.indexOf('        delegate: Component {'), d1 = s.indexOf('\n        }\n', d0);
let del = s.slice(d0, d1);
const n = (del.match(/model\.alertInfo/g) || []).length;
del = del.replace('            Alert {\n', '            Alert {\n                property var myInfo: root.myHomeFixAlert(model.alertInfo)\n');
del = del.replace(/model\.alertInfo/g, 'myInfo').replace('property var myInfo: root.myHomeFixAlert(myInfo)', 'property var myInfo: root.myHomeFixAlert(model.alertInfo)');
s = s.slice(0, d0) + del + s.slice(d1);
fs.writeFileSync(process.argv[3], s);
console.log('ok, replaced refs:', n);
