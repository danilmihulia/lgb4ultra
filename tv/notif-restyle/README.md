# notif-restyle — LG system alerts/toasts in My Home style
`node make-patch.js <stock /usr/lib/qml/SystemUI/Notification copy> ./qml` regenerates `qml/` (4 files)
AlertView.qml: `node usbalert-patch.js <stock AlertView.qml> qml/AlertView.qml` — LG USB «що зробити» alert → наш «Флешку підключено» + «Відкрити у Файлах» (2026-11-21).
from the stock QML; every replacement is count-checked, so a firmware change fails loudly.
On TV: `/media/developer/notif-patched` = full stock copy + these 4 files; hook 37 bind-mounts it.
Test: `luna-send -n 1 luna://com.webos.notification/createToast '{"sourceId":"x","message":"Тест"}'`.
