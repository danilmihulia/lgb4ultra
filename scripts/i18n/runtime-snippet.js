  // ---- interface language (chosen in the hub: settings category "myhome", key "uiLang"). Dictionary keys = Ukrainian text;
  // L(s) = translation or s. Translations: i18n/<lang>.json next to this page (source: i18n/<app>/ in the project).
  // our apps may NOT read settings (settingsservice → Access denied for com.user.*), so a root daemon on the TV
  // (deploy/poweron/poweron-home.sh) writes the hub's choice into i18n/current.json next to each app
  function curLang(){ try{ var x=new XMLHttpRequest(); x.open('GET','i18n/current.json',false); x.send(); return (JSON.parse(x.responseText)||{}).lang||null; }catch(e){ return null; } }
  var UILANG=(function(){ var c=curLang(); if(c){ try{ localStorage.setItem('uiLang',c); }catch(e){} return c; } try{ return localStorage.getItem('uiLang')||'uk'; }catch(e){ return 'uk'; } })(), DICT=null;
  if(UILANG!=='uk'){ try{ var lx=new XMLHttpRequest(); lx.open('GET','i18n/'+UILANG+'.json',false); lx.send(); if(lx.responseText) DICT=JSON.parse(lx.responseText); }catch(e){ DICT=null; } }
  function L(s){ return (DICT && DICT[s]) || s; }
  (function(){ if(!DICT || !document.body) return; document.documentElement.lang=UILANG;
    var w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n, list=[];
    while((n=w.nextNode())) list.push(n);
    list.forEach(function(t){ var v=t.nodeValue, k=v.replace(/\s+/g,' ').trim(); if(k && DICT[k]) t.nodeValue=v.replace(k, DICT[k]); });
    [].forEach.call(document.querySelectorAll('[placeholder],[title]'), function(el){ ['placeholder','title'].forEach(function(a){ var v=el.getAttribute(a); if(v && DICT[v.trim()]) el.setAttribute(a, DICT[v.trim()]); }); });
  })();
  // language changed while this app was in the background → reload once when it comes back
  function langCheck(){ var c=curLang(); if(c && c!==UILANG){ try{ localStorage.setItem('uiLang',c); }catch(e){} location.reload(); } }
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) langCheck(); });
  document.addEventListener('webOSRelaunch', langCheck);
