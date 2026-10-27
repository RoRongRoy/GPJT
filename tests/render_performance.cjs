// Optional reproducible render benchmark; requires Playwright and Chromium.
// Uses in-memory fixtures and local route interception, never a personal save.
const {chromium}=require('playwright');
const fs=require('fs'),cp=require('child_process');
const root=require('path').resolve(__dirname,'..');
const fixture=JSON.parse(cp.execFileSync(process.env.PYTHON||'python',['-c','import json;from server.game import new_world,POIS;from server.worldmap import WORLD_MAP;print(json.dumps({"world":new_world(),"pois":POIS,"map":WORLD_MAP}))'],{cwd:root}));
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('http://render.test/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<canvas id="world" style="width:1280px;height:720px"></canvas><canvas id="mini"></canvas><script src="/gothic.js"></script><script src="/sprite-manifest.js"></script><script src="/sprites.js"></script><script src="/world.js"></script>'});return route.fulfill({path:root+'/public'+url.pathname});});
 await page.goto('http://render.test/');await page.evaluate(f=>{window.fixture=f;window.view=new WorldView(document.querySelector('#world'),document.querySelector('#mini'));},fixture);
 await page.waitForFunction(()=>view.art.loaded===11);
 const results=[];
 for(const scene of [{name:'camp',x:22,y:23,w:1280,h:720,dpr:1},{name:'forest',x:78,y:30,w:1280,h:720,dpr:1},{name:'mobile-forest',x:78,y:30,w:370,h:580,dpr:2}]){
 await page.evaluate(s=>{world.style.width=s.w+'px';world.style.height=s.h+'px';Object.defineProperty(window,'devicePixelRatio',{value:s.dpr,configurable:true});fixture.world.player.x=s.x;fixture.world.player.y=s.y;view.camera=null;view.player=null;},scene);
 const result=await page.evaluate(async()=>{const costs=[],gaps=[];let previous;for(let i=0;i<70;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>10)gaps.push(now-previous);previous=now;fixture.world.player.x+=.008;view.draw(fixture,null,null);if(i>10)costs.push(performance.now()-now);}const percentile=(a,p)=>a.sort((x,y)=>x-y)[Math.floor(a.length*p)];return {drawMedian:percentile(costs,.5),drawP95:percentile(costs,.95),frameMedian:percentile(gaps,.5),frameP95:percentile(gaps,.95)};});results.push({scene:scene.name,...result});
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})();
