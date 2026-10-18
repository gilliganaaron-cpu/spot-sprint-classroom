// Minimal connection layer using native fetch + EventSource, no installed libraries.
// Implements only the small event methods used by Spot Sprint.
(function () {
  window.io = function () {
    const listeners = new Map();
    let stream = null;
    let streamKey = null;
    const client = {
      connected:false,
      on(name,handler) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(handler);
      },
      emit(name,data,callback) {
        fetch('/api/action', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({ action:name, data, session:window.spotSession || null })
        }).then(r=>r.json()).then(result=>callback?.(null,result))
          .catch(e=>callback?.(e,null));
      },
      timeout() { return { emit:(name,data,callback)=>client.emit(name,data,callback) }; },
      setRoom(session) {
        window.spotSession = session;
        if (!session) return client.clearRoom();
        const key = [session.code,session.role,session.token].join(':');
        if (key === streamKey && stream) return;
        if (stream) stream.close();
        streamKey=key;
        const url=`/events?code=${encodeURIComponent(session.code)}&role=${encodeURIComponent(session.role)}&token=${encodeURIComponent(session.token)}`;
        stream=new EventSource(url);
        stream.onmessage=e=>{
          try { fire('room:update',JSON.parse(e.data)); } catch { /* malformed event */ }
        };
        stream.addEventListener('maze:frame',e=>{try{fire('maze:frame',JSON.parse(e.data));}catch{}});
        stream.addEventListener('jump:frame',e=>{try{fire('jump:frame',JSON.parse(e.data));}catch{}});
        stream.addEventListener('replaced',()=>fire('session:replaced'));
        stream.addEventListener('room-closed',e=>{
          let payload = {};
          try { payload = JSON.parse(e.data); } catch { /* optional reason */ }
          fire('room:closed',payload);
          client.clearRoom();
        });
        stream.addEventListener('removed',e=>{
          let payload = {};
          try { payload = JSON.parse(e.data); } catch { /* optional reason */ }
          fire('session:removed',payload);
          client.clearRoom();
        });
        stream.onopen=()=>{
          const wasConnected=client.connected;
          client.connected=true;
          if (!wasConnected) fire('connect');
        };
        stream.onerror=()=>{
          if (client.connected) { client.connected=false; fire('disconnect'); }
        };
      },
      clearRoom() {
        if (stream) { stream.close(); stream=null; }
        streamKey=null;
        window.spotSession=null;
      }
    };
    function fire(name,...args) { for (const handler of (listeners.get(name)||[])) handler(...args); }
    // Initial connectivity check, also triggers session re-entry on page refresh.
    queueMicrotask(()=>fetch('/health').then(r=>{
      if (!r.ok) throw new Error('Offline');
      client.connected=true;fire('connect');
    }).catch(()=>{client.connected=false;fire('disconnect');}));
    return client;
  };
})();
