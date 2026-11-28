#!/bin/sh
# My Home: open our hub when the TV is switched on with the remote / TV buttons (LG resumes into Live TV
# or the last input otherwise). NOT when something else woke the TV: PS5 via HDMI-CEC ("hdmiCec"),
# casting / Wake-on-LAN, app buttons (Netflix…), timers.
# Runs as a daemon started by boot hook 41 (deploy/init.d/41-poweron-home.sh); log /media/developer/myhome-poweron/poweron.log.
# Revert: rm /var/lib/webosbrew/init.d/41-poweron-home.sh and kill this script (or reboot).
LOG=/media/developer/myhome-poweron/poweron.log   # persistent: power-offs may turn into reboots
[ -f $LOG ] && tail -200 $LOG > $LOG.tmp && mv $LOG.tmp $LOG
PID=/tmp/myhome-poweron.pid
[ -f $PID ] && kill -0 "$(cat $PID)" 2>/dev/null && exit 0
echo $$ > $PID
say(){ echo "$(date +%T) $*" >> "$LOG"; }
# power-on reasons that mean "the user pressed power" -> hub
HUB_REASONS=" remoteKey localKey aiKey upDownKey lastPowerOn quickStart voice voiceFull voicePartial "
fgapp(){ timeout 3 luna-send -n 1 -f luna://com.webos.surfacemanager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -1; }

# After a start / power-on LG puts Live TV up first; with no aerial signal its no-signal slideshow then launches
# our saver over the hub ("hub, then straight away the slideshow"). So once the hub is up: close Live TV (it is
# only a preloaded background app here) and for $1 s close the saver if it pops up anyway.
guard(){
  i=0; while [ "$(fgapp)" != com.webos.app.home ] && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done
  if luna-send -n 1 luna://com.webos.applicationManager/running '{}' </dev/null 2>/dev/null | grep -q '"com.webos.app.livetv"'; then
    timeout 5 luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.livetv"}' </dev/null >/dev/null 2>&1; say "closed livetv"
  fi
  end=$(( $(cut -d. -f1 /proc/uptime) + $1 ))
  while [ "$(cut -d. -f1 /proc/uptime)" -lt $end ]; do
    if [ "$(fgapp)" = com.webos.app.screensaver ]; then
      timeout 5 luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.screensaver"}' </dev/null >/dev/null 2>&1; say "closed saver over the hub"
    fi
    sleep 2
  done
}

on_power_on(){
  r=$(timeout 3 luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerOnReason '{}' </dev/null 2>/dev/null | sed -n 's/.*"reason": *"\([^"]*\)".*/\1/p')
  case "$HUB_REASONS" in *" $r "*) ;; *) say "power on, reason=$r -> leave as is"; return;; esac
  # let LG bring up its own first app (Live TV / last input), then put the hub on top
  i=0; fg=$(fgapp)
  while [ -z "$fg" ] && [ $i -lt 10 ]; do sleep 1; i=$((i+1)); fg=$(fgapp); done
  sleep 1; fg=$(fgapp)
  if [ "$fg" = com.webos.app.home ]; then say "power on, reason=$r, hub already up"; guard 30; return; fi
  say "power on, reason=$r, foreground=${fg:-none} (waited ${i}s) -> launch hub"
  timeout 5 luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
  guard 30
}

say "daemon start"
# Interface language + theme (hub → «Мова»/«Тема», settings myhome/uiLang + uiTheme). Our com.user.* apps may not read
# settings (Access denied), so put the hub's choice into i18n/current.json + current.js next to each of them (+ our
# system saver; our restyled system popups use LG's UI locale, which the hub switches too). Apps read it at start and when they come back to the
# screen. Re-written on every change and when this daemon starts (covers reinstalled apps too).
UI_LANG=""; UI_THEME=""; UI_DVD="on"   # + the hub's saver clock mode (myhome/saverDvd) for our system saver
write_ui(){
  for d in /media/developer/apps/usr/palm/applications/com.user.browser /media/developer/apps/usr/palm/applications/com.user.iptv \
           /media/developer/apps/usr/palm/applications/com.user.explorer /media/developer/myhome-saver; do
    [ -d "$d/i18n" ] || continue
    printf '{"lang":"%s","theme":"%s","dvd":"%s"}' "$UI_LANG" "$UI_THEME" "$UI_DVD" > "$d/i18n/current.json"
    # the browser can't use a sync XHR (framegate) → it loads this as a <script>
    printf 'window.__curLang="%s";window.__curTheme="%s";\n' "$UI_LANG" "$UI_THEME" > "$d/i18n/current.js"
  done
}
( while :; do
    luna-send -i luna://com.webos.settingsservice/getSystemSettings '{"category":"myhome","keys":["uiLang","uiTheme","saverDvd"],"subscribe":true}' </dev/null 2>/dev/null |
    while read -r line; do
      v=$(echo "$line" | sed -n 's/.*"uiLang": *"\([a-z][a-z]\)".*/\1/p')
      t=$(echo "$line" | sed -n 's/.*"uiTheme": *"\([a-z]*\)".*/\1/p')
      dv=$(echo "$line" | sed -n 's/.*"saverDvd": *"\([a-z]*\)".*/\1/p')
      [ -n "$v$t$dv" ] || continue
      [ -n "$dv" ] && UI_DVD=$dv
      [ -n "$v" ] && UI_LANG=$v
      [ -n "$t" ] && UI_THEME=$t
      write_ui; say "ui -> lang=$UI_LANG theme=$UI_THEME saverDvd=$UI_DVD"
    done
    sleep 30   # no value yet (hub never set it) or the subscription ended
  done ) &
# Privacy/ad watcher (2026-11-22): «Рекламні cookie» was once found ON without the user touching it. Log every change of
# the ad/privacy keys (time + foreground app) to privacy.log, so we can see WHEN and next to WHAT it flips. Log only.
PLOG=/media/developer/myhome-poweron/privacy.log; mkdir -p /tmp/myhome-priv
priv_watch(){   # $1 category, $2 JSON key list
  ( while :; do
      luna-send -i luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"$1\",\"keys\":$2,\"subscribe\":true}" </dev/null 2>/dev/null |
      while read -r line; do
        by=$(echo "$line" | sed -n 's/.*"caller": *"\([^"]*\)".*/\1/p')   # settingsservice names the app that wrote it
        for kv in $(echo "$line" | grep -o '"[A-Za-z]*": *"[^"]*"' | tr -d ' "' ); do
          k=${kv%%:*}; v=${kv#*:}; case "$k" in category|method|value|caller) continue;; esac
          f=/tmp/myhome-priv/$1.$k; old=$(cat "$f" 2>/dev/null)
          [ "$old" = "$v" ] && continue; echo "$v" > "$f"
          echo "$(date '+%F %T') $1.$k: ${old:-?} -> $v (by: ${by:-?}, fg: $(fgapp))" >> "$PLOG"
        done
      done
      sleep 30
    done ) &
}
priv_watch general '["adCookie","personalRecommend","homePromotion","aiNudge","doNotSellMyPersonalInformation","lmt","screenSaverAd"]'
priv_watch option '["thirdPartyCookie","hbbTvDeviceId"]'
# PS5 rest → TV off (2026-11-28). With «Power Off Link» on, the PS5 sends this TV only <Inactive Source> (CEC 0x9D),
# never <Standby> (seen in LG's /var/log/cecmessages), so LG keeps the TV on. If the PS5 (CEC logical address 4) was the
# focused source when it says «inactive», nothing became active within 1 s AND the PS5 is what switched the TV on
# (power-on reason hdmiCec), switch the TV off like the hub's «Вимкнути». TV switched on by the user (remote / hub)
# or already on the hub/another input when the PS5 rests → nothing happens.
# Off switch: touch /media/developer/myhome-poweron/cecoff.off
cec_off_check(){
  sleep 1   # was 8 s: the user wants the TV off at once (no slideshow flash)
  [ -e /media/developer/myhome-poweron/cecoff.off ] && { say "cec: PS5 went to rest -> auto-off is paused (cecoff.off)"; return; }
  after=$(tail -n 200 /var/log/cecmessages 2>/dev/null | awk '/Undefined opcode\(0x9D\)/{f=1; buf=""; next} f && /Focus l\.Addr\(|ActiveSource|Alread TV Power on|RoutingChange/{buf=buf $0 "\n"} END{printf "%s", buf}')
  if [ -n "$after" ]; then say "cec: PS5 inactive, but a source became active again -> keep on"; return; fi
  st=$(timeout 3 luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null 2>/dev/null | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p')
  [ "$st" = "Active" ] || { say "cec: PS5 inactive, TV state '$st' -> nothing to do"; return; }
  # the session belongs to the PS5 only if the PS5 switched the TV on (user rule 2026-11-28): TV on first (remote,
  # hub, then PS5 via hub or controller) → the TV was not switched on for the PS5 → keep it on
  why=$(timeout 3 luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerOnReason '{}' </dev/null 2>/dev/null | sed -n 's/.*"reason": *"\([^"]*\)".*/\1/p')
  [ "$why" = "hdmiCec" ] || { say "cec: PS5 went to rest, but the TV was switched on by '$why' (not the PS5) -> keep on"; return; }
  say "cec: PS5 went to rest while on screen -> TV off (fg: $(fgapp))"
  luna-send -n 1 luna://com.webos.service.tvpower/power2/powerOff '{"reason":"remoteKey"}' </dev/null >/dev/null 2>&1
}
( while :; do
    focus=""
    tail -n0 -F /var/log/cecmessages 2>/dev/null | while read -r l; do
      case "$l" in
        *"Focus l.Addr("*) focus=$(echo "$l" | sed -n 's/.*Focus l\.Addr(\([0-9]*\)).*/\1/p');;
        *"Undefined opcode(0x9D)"*) if [ "$focus" = 4 ]; then cec_off_check & else say "cec: inactive source, focus=$focus -> ignore"; fi;;
      esac
    done
    sleep 10   # log missing (very early boot) or tail ended
  done ) &
# «Канали» (com.user.iptv) replaces LG's Live TV everywhere (2026-11-22): whenever Live TV comes to the foreground
# after boot (LG menus, keys, …), close it and open our IPTV app. Boot itself is handled by early.sh / guard.
( while :; do
    luna-send -i luna://com.webos.applicationManager/getForegroundAppInfo '{"subscribe":true}' </dev/null 2>/dev/null |
    while read -r line; do
      case "$line" in *'"appId": "com.webos.app.livetv"'*|*'"appId":"com.webos.app.livetv"'*)
        [ "$(cut -d. -f1 /proc/uptime)" -lt 90 ] && continue
        say "Live TV opened -> «Канали» instead"
        timeout 5 luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.livetv"}' </dev/null >/dev/null 2>&1
        timeout 5 luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.user.iptv"}' </dev/null >/dev/null 2>&1;;
      esac
    done
    sleep 5
  done ) &
# started by the boot hook (~33 s): same guard for the boot itself
[ "$(cut -d. -f1 /proc/uptime)" -lt 120 ] && guard 40 &
prev=""
while :; do
  luna-send -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' </dev/null 2>/dev/null |
  while read -r line; do
    st=$(echo "$line" | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p')
    [ -z "$st" ] && continue
    if [ "$st" != "$prev" ]; then
      say "state '$prev' -> '$st' ($(echo "$line" | sed -n 's/.*"processing": *"\([^"]*\)".*/\1/p'))"
      # a real power-on: from (suspend / standby / off) to Active; ignore the first reply and screen-off/on
      if [ "$st" = Active ] && [ -n "$prev" ] && case "$prev" in *Screen*) false;; *) true;; esac; then
        on_power_on &
      fi
      prev=$st
    fi
  done
  say "subscription ended, retry in 5 s"; sleep 5
done
