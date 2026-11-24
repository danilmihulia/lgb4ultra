# Коды кнопок пульта (captured 2026-11-19, device /dev/input/event2)

Пойманы скриптом `scratchpad/captureall.js` (EV_KEY press, value=1) пока пользователь жал кнопки.
Живьём на ТВ кнопки SETTINGS/SOURCE/GUIDE идут через **event2** (а HOME/BACK/⋯ — через event3).

| Кнопка | evdev code (event2) | Linux-значение | Куда вести |
|---|---|---|---|
| SETTINGS (шестерёнка) | **139** (+1198) | KEY_MENU | наши настройки |
| SOURCE (источник) | **241** | — | наш экран входов (HDMI-пикер) |
| GUIDE (программа) | **362** (+1199) | KEY_PROGRAM (EPG) | IPTV/каналы |

- `412` повторялся как фон между нажатиями (BACK/activity) — игнорируем.
- Уже известные (event3): HOME=773, BACK=412, ⋯=994 (JS keyCode 1062).

## План ремапа
Демон (по образцу `myhome-home/home-key.js`, но читает **event2**): на 139/241/362 →
foreground наш home + сигнал открыть нужный экран (settings-оверлей / inputs-оверлей / IPTV-апп).
Запуск через boot-hook (как 31-myhome-homekey). Verify: нажать кнопку → открылся наш экран.
