// Socket.IO v4 / Engine.IO v4 compatible client (WebSocket + HTTP long-polling fallback).
(function(global){
 const RECORD_SEP='\x1e';
 class SocketIOClient {
  constructor(url,opts={}){
   if(typeof url==='object'&&url!==null){opts=url;url='';}
   this.url=url||'';
   this.opts=opts;
   this.path=opts.path||'/socket.io/';
   this.auth=opts.auth||{};
   this.query=opts.query||{};
   this.transports=opts.transports||['websocket','polling'];
   this.reconnection=opts.reconnection!==false;
   this.reconnectionDelay=opts.reconnectionDelay||1000;
   this.listeners=new Map();
   this.acks=new Map();
   this.ackSeq=1;
   this.id=null;
   this.sid=null;
   this.connected=false;
   this.closed=false;
   this.ws=null;
   this.polling=false;
   this.pingTimer=null;
   if(opts.autoConnect!==false)this.connect();
  }
  on(event,fn){
   if(!this.listeners.has(event))this.listeners.set(event,new Set());
   this.listeners.get(event).add(fn);
   return this;
  }
  off(event,fn){
   if(!fn)this.listeners.delete(event);
   else this.listeners.get(event)?.delete(fn);
   return this;
  }
  _fire(event,...args){
   const set=this.listeners.get(event);
   if(set)for(const fn of [...set])try{fn(...args);}catch(e){console.error(e);}
  }
  _queryString(extra={}){
   const params=new URLSearchParams({EIO:'4',...this.query,...this.auth,...extra});
   return params.toString();
  }
  connect(){
   this.closed=false;
   if(this.transports.includes('websocket')&&typeof WebSocket==='function'){
    this._connectWS();
   }else{
    this._connectPolling();
   }
   return this;
  }
  _connectWS(){
   try{
    const loc=global.location||{protocol:'http:',host:'127.0.0.1:8080'};
    const proto=loc.protocol==='https:'?'wss:':'ws:';
    const base=this.url?this.url.replace(/^http/,'ws'):`${proto}//${loc.host}`;
    const wsUrl=`${base}${this.path}?${this._queryString({transport:'websocket'})}`;
    const ws=new WebSocket(wsUrl);
    this.ws=ws;
    let opened=false;
    ws.onopen=()=>{opened=true;};
    ws.onmessage=ev=>{
     const raw=String(ev.data||'');
     for(const pkt of raw.split(RECORD_SEP))this._onEIOPacket(pkt,p=>ws.readyState===1&&ws.send(p));
    };
    ws.onerror=()=>{
     if(!opened&&this.transports.includes('polling')){
      this.ws=null;
      this._connectPolling();
     }
    };
    ws.onclose=()=>{
     const wasConnected=this.connected;
     this.connected=false;this.ws=null;
     clearInterval(this.pingTimer);this.pingTimer=null;
     for(const [ackId,cb] of this.acks.entries()){
      this.acks.delete(ackId);
      try{cb({ok:false,error:'연결이 재설정되었습니다.',status:503});}catch{}
     }
     if(wasConnected)this._fire('disconnect','transport close');
     if(!this.closed&&this.reconnection){
      setTimeout(()=>{if(!this.closed&&!this.connected)this.connect();},this.reconnectionDelay);
     }
    };
   }catch{
    if(this.transports.includes('polling'))this._connectPolling();
   }
  }
  async _connectPolling(){
   if(this.polling||this.closed)return;
   this.polling=true;
   try{
    const openUrl=`${this.url}${this.path}?${this._queryString({transport:'polling',t:Date.now()})}`;
    const res=await fetch(openUrl,{headers:this._headers()});
    if(!res.ok)throw new Error('Polling handshake failed');
    const text=await res.text();
    for(const pkt of text.split(RECORD_SEP))this._onEIOPacket(pkt,p=>this._postPolling(p));
    while(this.polling&&!this.closed&&this.sid){
     const pollUrl=`${this.url}${this.path}?${this._queryString({transport:'polling',sid:this.sid,t:Date.now()})}`;
     const pollRes=await fetch(pollUrl,{headers:this._headers()});
     if(!pollRes.ok)throw new Error('Polling read failed');
     const body=await pollRes.text();
     for(const pkt of body.split(RECORD_SEP))this._onEIOPacket(pkt,p=>this._postPolling(p));
    }
   }catch(err){
    const wasConnected=this.connected;
    this.connected=false;this.polling=false;this.sid=null;
    if(wasConnected)this._fire('disconnect','poll error');
    else this._fire('connect_error',err);
    if(!this.closed&&this.reconnection){
     setTimeout(()=>{if(!this.closed&&!this.connected)this._connectPolling();},this.reconnectionDelay);
    }
   }
  }
  _headers(){
   const h={'Content-Type':'text/plain;charset=UTF-8'};
   const k=this.auth.key||this.query.key;
   const s=this.auth.session||this.query.session;
   if(k)h['X-Access-Key']=k;
   if(s)h['X-Session-ID']=s;
   return h;
  }
  async _postPolling(packet){
   if(!this.sid)return;
   const postUrl=`${this.url}${this.path}?${this._queryString({transport:'polling',sid:this.sid,t:Date.now()})}`;
   await fetch(postUrl,{method:'POST',headers:this._headers(),body:packet});
  }
  _sendEIO(packet){
   if(this.ws&&this.ws.readyState===1){
    this.ws.send(packet);
   }else if(this.sid){
    this._postPolling(packet).catch(()=>{});
   }
  }
  _onEIOPacket(packet,reply){
   if(!packet)return;
   const type=packet[0],rest=packet.slice(1);
   if(type==='0'){
    try{
     const info=JSON.parse(rest);
     this.sid=info.sid;
     clearInterval(this.pingTimer);
     this.pingTimer=setInterval(()=>{
      if(this.connected)this._sendEIO('3');
     },Math.max(5000,Math.floor((info.pingInterval||15000)*0.75)));
    }catch{}
   }else if(type==='2'){
    reply('3'+rest);
   }else if(type==='3'){
    // pong / heartbeat ack
   }else if(type==='4'){
    this._onSIOPacket(rest);
   }else if(type==='1'){
    this.connected=false;
    this._fire('disconnect','io server disconnect');
   }
  }
  _onSIOPacket(data){
   if(!data)return;
   const sioType=data[0],rest=data.slice(1);
   if(sioType==='0'){
    try{const info=JSON.parse(rest||'{}');this.id=info.sid||this.sid;}catch{this.id=this.sid;}
    if(!this.connected){this.connected=true;this._fire('connect');}
   }else if(sioType==='1'){
    this.connected=false;
    this._fire('disconnect','io server disconnect');
   }else if(sioType==='4'){
    let msg='Connection error';
    try{msg=JSON.parse(rest).message||msg;}catch{}
    this._fire('connect_error',new Error(msg));
   }else if(sioType==='2'){
    let idx=0;while(idx<rest.length&&rest[idx]>='0'&&rest[idx]<='9')idx++;
    try{
     const arr=JSON.parse(rest.slice(idx));
     if(Array.isArray(arr)&&arr.length)this._fire(arr[0],...arr.slice(1));
    }catch{}
   }else if(sioType==='3'){
    let idx=0;while(idx<rest.length&&rest[idx]>='0'&&rest[idx]<='9')idx++;
    const ackId=Number(rest.slice(0,idx));
    const cb=this.acks.get(ackId);
    if(cb){
     this.acks.delete(ackId);
     try{const arr=JSON.parse(rest.slice(idx));cb(...(Array.isArray(arr)?arr:[arr]));}catch{}
    }
   }
  }
  emit(event,payload,ack){
   let ackPrefix='',ackId=0;
   if(typeof payload==='function'){ack=payload;payload={};}
   if(typeof ack==='function'){
    ackId=this.ackSeq++;
    const timer=setTimeout(()=>{
     if(this.acks.has(ackId)){
      this.acks.delete(ackId);
      try{ack({ok:false,error:'네트워크 응답 지연',status:408});}catch{}
     }
    },3200);
    this.acks.set(ackId,(...args)=>{clearTimeout(timer);ack(...args);});
    ackPrefix=String(ackId);
   }
   const body=JSON.stringify([event,payload]);
   this._sendEIO(`42${ackPrefix}${body}`);
   return this;
  }
  disconnect(){
   this.closed=true;
   this.polling=false;
   if(this.ws){try{this.ws.close();}catch{}this.ws=null;}
   this.connected=false;
   return this;
  }
  close(){return this.disconnect();}
 }
 global.io=function(url,opts){return new SocketIOClient(url,opts);};
 global.io.SocketIOClient=SocketIOClient;
})(typeof window!=='undefined'?window:globalThis);
