
/* time of day: read before the engine builds its lights */
(function(){var t='dusk';try{t=localStorage.getItem('saltline.time')||'dusk'}catch(e){}var q=/[?&]time=(night|dusk)/.exec(location.search);if(q)t=q[1];window.__SL_TIME=t;window.__SL_NIGHT=t==='night';})();
