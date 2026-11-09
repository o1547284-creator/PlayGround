(() => {
'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const shell=document.getElementById('game-shell');
const ui={intro:document.getElementById('intro'),result:document.getElementById('result'),start:document.getElementById('start'),again:document.getElementById('again'),status:document.getElementById('status'),title:document.getElementById('result-title'),copy:document.getElementById('result-copy'),kicker:document.getElementById('result-kicker'),flash:document.getElementById('flash'),bottom:document.getElementById('bottom-tip'),stick:document.getElementById('stick-zone'),knob:document.getElementById('stick-knob'),dash:document.getElementById('dash-touch'),nova:document.getElementById('nova-touch')};
let W=0,H=0,dpr=1,last=0,mode='menu',time=0,shake=0,flash=0,damageGlow=0,stars=[],particles=[],bullets=[],shots=[],rings=[],floaters=[];
const keys={},input={x:0,y:0,pointer:false};
const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
let player,boss,score=0,elapsed=0,phase=1,spawnClock=0,shotClock=0,novaReady=0,dashReady=0,combo=0,comboTimer=0;
function resize(){const r=shell.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);stars=Array.from({length:Math.floor(W*H/8500)},()=>({x:Math.random()*W,y:Math.random()*H,z:rand(.35,1),p:rand(0,6.3)}));if(player){player.x=clamp(player.x,30,W-30);player.y=clamp(player.y,90,H-45)}}
window.addEventListener('resize',resize);resize();
function makePlayer(){return{x:W*.5,y:H*.74,r:13,hp:100,max:100,inv:0,dash:0,vx:0,vy:0,aim:0};}
function makeBoss(){return{x:W*.5,y:H*.27,r:42,hp:1000,max:1000,phase:1,clock:0,move:0,open:0,hitFlash:0,attack:0,burst:0,dead:false};}
function startGame(){player=makePlayer();boss=makeBoss();bullets=[];shots=[];particles=[];rings=[];floaters=[];score=0;elapsed=0;phase=1;spawnClock=1.1;shotClock=0;novaReady=0;dashReady=0;combo=0;comboTimer=0;shake=0;damageGlow=0;mode='play';shell.classList.add('playing');ui.intro.classList.add('hidden');ui.result.hidden=true;ui.status.textContent='THE ASTRAL SOVEREIGN';ui.bottom.textContent='DODGE THE SIGILS · STRIKE WHEN THE EYE OPENS';}
ui.start.addEventListener('click',startGame);ui.again.addEventListener('click',startGame);
function endGame(win){mode=win?'win':'lose';shell.classList.remove('playing');ui.result.hidden=false;ui.title.textContent=win?'VICTORY':'FALLEN';ui.copy.textContent=win?'The stars remember your name.':'The void is patient. Rise and try again.';ui.kicker.textContent=win?'THE VOID RECEDES':'THE LIGHT FADES';ui.status.textContent=win?'CALAMITY AVERTED':'SIGNAL LOST';ui.bottom.textContent='';}
function color(hex,a=1){return `rgba(${hex},${a})`}
function burst(x,y,n,hue=270,power=1){for(let i=0;i<n;i++){const a=rand(0,Math.PI*2),s=rand(.7,4.2)*power;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.28,.85),max:1,size:rand(1,4),hue});}}
function floatText(x,y,text,hue=270){floaters.push({x,y,text,hue,life:1});}
function ring(x,y,r,life,hue=270,width=2){rings.push({x,y,r,life,max:life,hue,width});}
function moveTo(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
window.addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault();if(e.key===' '&&mode==='play')dash();if((e.key.toLowerCase()==='e'||e.key.toLowerCase()==='shift')&&mode==='play')nova();});window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
canvas.addEventListener('pointermove',e=>{if(input.pointer&&mode==='play'){const p=moveTo(e);input.x=clamp((p.x-input.originX)/42,-1,1);input.y=clamp((p.y-input.originY)/42,-1,1)}});
canvas.addEventListener('pointerdown',e=>{if(mode!=='play')return;const p=moveTo(e);if(p.y>H*.63&&p.x<W*.5){input.pointer=true;input.originX=p.x;input.originY=p.y;}else if(p.x>W*.75&&p.y>H*.7)dash();});
window.addEventListener('pointerup',()=>{input.pointer=false;input.x=0;input.y=0;});
let stickId=null;
ui.stick.addEventListener('pointerdown',e=>{if(mode!=='play')return;e.preventDefault();stickId=e.pointerId;ui.stick.setPointerCapture(stickId);stickMove(e)});
ui.stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e)});
ui.stick.addEventListener('pointerup',e=>{if(e.pointerId===stickId){stickId=null;input.x=0;input.y=0;ui.knob.style.transform='translate(0,0)'}});
function stickMove(e){const b=ui.stick.querySelector('.stick-ring').getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2,dx=e.clientX-cx,dy=e.clientY-cy,m=Math.max(1,Math.hypot(dx,dy)),lim=b.width*.31,x=dx*Math.min(1,lim/m),y=dy*Math.min(1,lim/m);input.x=x/lim;input.y=y/lim;ui.knob.style.transform=`translate(${x}px,${y}px)`}
ui.dash.addEventListener('pointerdown',e=>{e.preventDefault();dash()});ui.nova.addEventListener('pointerdown',e=>{e.preventDefault();nova()});
function dash(){if(mode!=='play'||dashReady>0)return;let dx=input.x+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=input.y+(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(!dx&&!dy){dx=player.x-boss.x;dy=player.y-boss.y;}const m=Math.hypot(dx,dy)||1;player.vx=dx/m*790;player.vy=dy/m*790;player.inv=.52;player.dash=.18;dashReady=1.15;burst(player.x,player.y,13,195,1.3);ring(player.x,player.y,10,.4,195,2);}
function nova(){if(mode!=='play'||novaReady>0)return;novaReady=8;ring(player.x,player.y,10,.68,190,4);flash=.15;shake=10;for(let i=0;i<34;i++){const a=i/34*Math.PI*2;shots.push({x:player.x,y:player.y,vx:Math.cos(a)*430,vy:Math.sin(a)*430,r:4,life:1.2,hue:190,damage:14});}for(let i=bullets.length-1;i>=0;i--){if(Math.hypot(bullets[i].x-player.x,bullets[i].y-player.y)<190){burst(bullets[i].x,bullets[i].y,4,190);bullets.splice(i,1)}}floatText(player.x,player.y-28,'NOVA!',190);}
function fireBoss(){if(!boss||boss.dead)return;const p=player,b=boss;const a=angle(b,p),speed=phase===1?145:phase===2?180:210;
 if(b.attack===0){for(let i=-1;i<=1;i++)bullets.push({x:b.x,y:b.y+20,vx:Math.cos(a+i*.19)*speed,vy:Math.sin(a+i*.19)*speed,r:8,life:6,hue:285,damage:14,mark:0});}
 else if(b.attack===1){const n=phase===1?9:13;for(let i=0;i<n;i++){const aa=a+(i-(n-1)/2)*.115;bullets.push({x:b.x,y:b.y+10,vx:Math.cos(aa)*speed*.83,vy:Math.sin(aa)*speed*.83,r:6,life:6,hue:330,damage:10,mark:0});}}
 else {for(let i=0;i<8;i++){const aa=i*Math.PI/4+b.clock*.35;bullets.push({x:b.x,y:b.y,vx:Math.cos(aa)*speed*.75,vy:Math.sin(aa)*speed*.75,r:7,life:7,hue:44,damage:12,mark:0});}}
 ring(b.x,b.y+14,13,.4,phase===3?45:285,2);
}
function update(dt){time+=dt;if(mode!=='play'){updateFx(dt);return}elapsed+=dt;
 player.inv=Math.max(0,player.inv-dt);dashReady=Math.max(0,dashReady-dt);novaReady=Math.max(0,novaReady-dt);comboTimer-=dt;if(comboTimer<=0)combo=0;
 let dx=input.x,dy=input.y;if(keys.d||keys.arrowright)dx+=1;if(keys.a||keys.arrowleft)dx-=1;if(keys.s||keys.arrowdown)dy+=1;if(keys.w||keys.arrowup)dy-=1;let m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}const speed=245;
 if(player.dash>0){player.dash-=dt;player.x+=player.vx*dt;player.y+=player.vy*dt;player.vx*=Math.pow(.08,dt);player.vy*=Math.pow(.08,dt)}else{player.x+=dx*speed*dt;player.y+=dy*speed*dt;}
 player.x=clamp(player.x,24,W-24);player.y=clamp(player.y,90,H-35);
 boss.clock+=dt;boss.move+=dt;boss.hitFlash=Math.max(0,boss.hitFlash-dt);
 const hpRatio=boss.hp/boss.max,newPhase=hpRatio<.65?2:hpRatio<.3?3:1;
 if(newPhase!==phase){phase=newPhase;boss.phase=phase;boss.open=1.6;boss.attack=0;boss.clock=0;bullets=[];ring(boss.x,boss.y,35,.9,phase===3?45:285,4);burst(boss.x,boss.y,50,phase===3?45:285,2);floatText(boss.x,boss.y-70,phase===2?'ASCENSION':'FINAL WRATH',phase===3?45:285);shake=11;}
 boss.x=W*.5+Math.sin(boss.move*(phase===3?1.15:.66))*Math.min(W*.25,210);boss.y=H*.25+Math.sin(boss.move*.9)*Math.min(H*.055,28);
 boss.open=Math.max(0,boss.open-dt);boss.attack-=dt;
 if(boss.attack<=0){boss.attack=phase===1?1.4:phase===2?1.05:.78;boss.open=phase===1?.58:.42;fireBoss();if(phase>=2&&Math.random()<.3){setTimeout(()=>{if(mode==='play')fireBoss()},180)}}
 // The eye opens briefly between volleys; precise shots are rewarded.
 shotClock-=dt;if(shotClock<=0){shotClock=.16;const a=angle(player,boss);player.aim=a;shots.push({x:player.x+Math.cos(a)*16,y:player.y+Math.sin(a)*16,vx:Math.cos(a)*510,vy:Math.sin(a)*510,r:3.3,life:1.15,hue:195,damage:10});}
 for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life<=0||s.x<-10||s.x>W+10||s.y<-10||s.y>H+10){shots.splice(i,1);continue}if(dist(s,boss)<boss.r+5){if(boss.open>0){boss.hp-=s.damage;boss.hitFlash=.09;score+=10;combo++;comboTimer=1.4;if(Math.random()<.15)floatText(boss.x+rand(-25,25),boss.y+rand(-28,25),`+${combo}`,195);if(Math.random()<.28)burst(s.x,s.y,4,195,1)}else if(Math.random()<.15)burst(s.x,s.y,2,275,.6);shots.splice(i,1);if(boss.hp<=0){boss.hp=0;boss.dead=true;burst(boss.x,boss.y,120,280,2.7);ring(boss.x,boss.y,30,1.3,280,7);mode='ending';setTimeout(()=>{if(mode==='ending')endGame(true)},650)} }}
 for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||b.x<-30||b.x>W+30||b.y<-30||b.y>H+30){bullets.splice(i,1);continue}if(player.inv<=0&&dist(player,b)<player.r+b.r){player.hp-=b.damage;player.inv=.75;damageGlow=.24;shake=7;burst(player.x,player.y,15,330,1.2);floatText(player.x,player.y-22,'−'+b.damage,345);bullets.splice(i,1);if(player.hp<=0){player.hp=0;burst(player.x,player.y,35,330,1.6);endGame(false);break}}}
 if(player.inv<=0&&dist(player,boss)<player.r+boss.r*.73){player.hp-=24;player.inv=.85;damageGlow=.25;shake=7;burst(player.x,player.y,14,330,1.2);if(player.hp<=0)endGame(false)}
 updateFx(dt);damageGlow=Math.max(0,damageGlow-dt);shake=Math.max(0,shake-dt*18);
}
function updateFx(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.3,dt);p.vy*=Math.pow(.3,dt);p.life-=dt;if(p.life<=0)particles.splice(i,1)}for(let i=rings.length-1;i>=0;i--){rings[i].life-=dt;if(rings[i].life<=0)rings.splice(i,1)}for(let i=floaters.length-1;i>=0;i--){floaters[i].y-=dt*25;floaters[i].life-=dt;if(floaters[i].life<=0)floaters.splice(i,1)}}
function drawBackground(){
 const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#090a1b');g.addColorStop(.52,'#10102a');g.addColorStop(1,'#080814');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 const glow=ctx.createRadialGradient(W*.5,H*.33,8,W*.5,H*.36,Math.max(W,H)*.59);glow.addColorStop(0,'rgba(96,61,153,.28)');glow.addColorStop(.48,'rgba(45,34,93,.13)');glow.addColorStop(1,'rgba(9,8,22,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
 for(const s of stars){const tw=.35+.65*Math.sin(time*1.6*s.z+s.p)*Math.sin(time*.7+s.p);ctx.fillStyle=`rgba(216,207,255,${.25*tw*s.z})`;ctx.beginPath();ctx.arc(s.x,s.y,1.3*s.z,0,Math.PI*2);ctx.fill();if(s.z>.85){ctx.strokeStyle=`rgba(192,168,255,${.1*tw})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(s.x-4,s.y);ctx.lineTo(s.x+4,s.y);ctx.moveTo(s.x,s.y-4);ctx.lineTo(s.x,s.y+4);ctx.stroke()}}
 // Far horizon and broken obsidian peaks.
 ctx.fillStyle='#0c0c1b';ctx.beginPath();ctx.moveTo(0,H*.57);for(let x=0;x<=W+40;x+=40)ctx.lineTo(x,H*.54+Math.sin(x*.019+1)*25+Math.cos(x*.037)*13);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
 ctx.fillStyle='rgba(6,7,17,.75)';ctx.beginPath();ctx.moveTo(0,H*.72);for(let x=0;x<=W+35;x+=35)ctx.lineTo(x,H*.65+Math.sin(x*.014+2)*24+Math.cos(x*.027)*18);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
 // Arena glyph circle
 const cy=H*.55,rx=Math.min(W*.43,490),ry=Math.min(H*.31,205);ctx.save();ctx.translate(W/2,cy);ctx.scale(1,ry/rx);ctx.strokeStyle='rgba(155,121,217,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,rx,0,Math.PI*2);ctx.stroke();ctx.setLineDash([3,14]);ctx.strokeStyle='rgba(192,153,255,.13)';ctx.beginPath();ctx.arc(0,0,rx*.83,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<16;i++){const a=i*Math.PI/8;ctx.save();ctx.rotate(a);ctx.strokeStyle='rgba(177,146,238,.18)';ctx.beginPath();ctx.moveTo(rx*.88,0);ctx.lineTo(rx*.98,0);ctx.stroke();ctx.restore()}ctx.restore();
 const floor=ctx.createLinearGradient(0,H*.6,0,H);floor.addColorStop(0,'rgba(96,73,137,.03)');floor.addColorStop(1,'rgba(20,18,37,.2)');ctx.fillStyle=floor;ctx.fillRect(0,H*.58,W,H*.42);
}
function drawBoss(){if(mode==='menu'){const b={x:W*.5,y:H*.28,r:42,open:1,hitFlash:0};drawBossBody(b);return}if(boss&&!boss.dead)drawBossBody(boss)}
function drawBossBody(b){const x=b.x,y=b.y,r=b.r,ang=time*.42,hot=phase===3?45:280;
 ctx.save();ctx.translate(x,y);
 // celestial halo
 ctx.rotate(ang);ctx.strokeStyle=phase===3?'rgba(255,195,102,.44)':'rgba(196,153,255,.42)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,r*1.9,r*.65,0,0,Math.PI*2);ctx.stroke();ctx.rotate(-ang*2);ctx.strokeStyle='rgba(206,184,255,.22)';ctx.beginPath();ctx.ellipse(0,0,r*1.65,r*.74,.7,0,Math.PI*2);ctx.stroke();ctx.rotate(ang);
 for(let i=0;i<3;i++){const a=time*(.7+i*.15)+i*2.1;ctx.fillStyle=i===1?'#ffe5ac':'#d6b7ff';ctx.shadowColor=i===1?'#ffbf6a':'#bb80ff';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(Math.cos(a)*r*1.55,Math.sin(a)*r*.55,3+i%2,0,Math.PI*2);ctx.fill()}ctx.shadowBlur=0;ctx.restore();
 // shoulders / spectral wings
 ctx.save();ctx.translate(x,y);for(let side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.fillStyle='rgba(75,53,115,.75)';ctx.strokeStyle='rgba(192,154,255,.48)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(r*.58,-r*.25);ctx.quadraticCurveTo(r*1.35,-r*1.2,r*2.0,-r*1.05);ctx.lineTo(r*1.38,-r*.4);ctx.lineTo(r*2.1,-r*.12);ctx.lineTo(r*1.25,r*.08);ctx.lineTo(r*1.75,r*.65);ctx.lineTo(r*.6,r*.35);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(213,190,255,.36)';ctx.beginPath();ctx.moveTo(r*.65,-r*.15);ctx.lineTo(r*1.8,-r*.9);ctx.moveTo(r*.7,0);ctx.lineTo(r*1.85,-r*.06);ctx.moveTo(r*.65,r*.17);ctx.lineTo(r*1.5,r*.52);ctx.stroke();ctx.restore()}
 const body=ctx.createRadialGradient(-r*.25,-r*.34,2,0,0,r*1.2);body.addColorStop(0,'#8e75bd');body.addColorStop(.38,'#4e3b78');body.addColorStop(1,'#18142f');ctx.fillStyle=body;ctx.strokeStyle='rgba(226,204,255,.7)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-r*1.15);ctx.lineTo(r*.78,-r*.58);ctx.lineTo(r*.92,r*.28);ctx.lineTo(r*.48,r*.85);ctx.lineTo(0,r*1.12);ctx.lineTo(-r*.48,r*.85);ctx.lineTo(-r*.92,r*.28);ctx.lineTo(-r*.78,-r*.58);ctx.closePath();ctx.fill();ctx.stroke();
 // eye opens and closes, shown as a slit when vulnerable
 const openness=b.open>0?1:.35;ctx.shadowColor=phase===3?'#ffc766':'#f1d0ff';ctx.shadowBlur=b.open>0?27:9;ctx.fillStyle=phase===3?'#ffe3a2':'#eadbff';ctx.beginPath();ctx.ellipse(0,-r*.03,r*.44,r*(.1+.19*openness),0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#261534';ctx.beginPath();ctx.ellipse(0,-r*.02,r*.115,r*.22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-r*.07,-r*.1,r*.045,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='rgba(229,212,255,.48)';ctx.lineWidth=1;for(let s of [-1,1]){ctx.beginPath();ctx.moveTo(s*r*.2,-r*.55);ctx.lineTo(s*r*.36,-r*.3);ctx.lineTo(s*r*.61,-r*.2);ctx.stroke()}ctx.restore();
}
function drawPlayer(){if(!player){const dummy={x:W*.5,y:H*.74,r:13,inv:0,aim:-Math.PI/2};drawPlayerBody(dummy);return}drawPlayerBody(player)}
function drawPlayerBody(p){const x=p.x,y=p.y;ctx.save();ctx.translate(x,y);if(p.inv>0&&Math.floor(time*24)%2===0)ctx.globalAlpha=.38;
 const aura=ctx.createRadialGradient(0,0,1,0,0,34);aura.addColorStop(0,'rgba(118,216,255,.28)');aura.addColorStop(1,'rgba(92,178,255,0)');ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,34,0,Math.PI*2);ctx.fill();
 ctx.rotate(p.aim||-Math.PI/2);ctx.shadowColor='#69d9ff';ctx.shadowBlur=15;ctx.strokeStyle='#a5efff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(22,0);ctx.stroke();ctx.shadowBlur=0;ctx.rotate(-(p.aim||-Math.PI/2));
 // hood and compact astral armor
 ctx.fillStyle='#182b4b';ctx.strokeStyle='#9be8ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-15);ctx.quadraticCurveTo(13,-11,11,3);ctx.lineTo(8,12);ctx.lineTo(0,15);ctx.lineTo(-8,12);ctx.lineTo(-11,3);ctx.quadraticCurveTo(-13,-11,0,-15);ctx.fill();ctx.stroke();
 ctx.fillStyle='#d9f6ff';ctx.beginPath();ctx.ellipse(0,-3,6,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#225475';ctx.beginPath();ctx.ellipse(0,-3,2,3,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(185,242,255,.8)';ctx.beginPath();ctx.moveTo(-7,7);ctx.lineTo(0,10);ctx.lineTo(7,7);ctx.stroke();
 for(let i=0;i<3;i++){const a=time*2+i*2.094;ctx.fillStyle='#9deaff';ctx.shadowColor='#66d5ff';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(Math.cos(a)*18,Math.sin(a)*16,1.8,0,Math.PI*2);ctx.fill()}ctx.shadowBlur=0;ctx.restore();
}
function panel(x,y,w,h){ctx.fillStyle='rgba(11,10,26,.76)';ctx.strokeStyle='rgba(185,153,232,.23)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,7);ctx.fill();ctx.stroke()}
function drawHud(){if(mode==='menu')return;
 const pad=W<700?16:30,bw=Math.min(W*.48,430),barY=48;ctx.save();panel((W-bw)/2,barY,bw,40);ctx.textAlign='center';ctx.font='9px "DM Mono",monospace';ctx.letterSpacing='2px';ctx.fillStyle=phase===3?'#ffd18d':'#dbc9ff';ctx.fillText(phase===1?'THE ASTRAL SOVEREIGN':phase===2?'THE ASTRAL SOVEREIGN · ASCENDED':'THE ASTRAL SOVEREIGN · CALAMITY',W/2,barY+13);const bx=(W-bw)/2+13,by=barY+22,iw=bw-26;ctx.fillStyle='rgba(89,75,113,.42)';ctx.beginPath();ctx.roundRect(bx,by,iw,7,4);ctx.fill();const hp=(boss?boss.hp/boss.max:1);const grad=ctx.createLinearGradient(bx,0,bx+iw,0);grad.addColorStop(0,phase===3?'#ffbf68':'#be8cff');grad.addColorStop(1,phase===3?'#ff6c70':'#f18dc6');ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(bx,by,iw*hp,7,4);ctx.fill();if(boss&&boss.open>0){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx+iw*hp,by-1);ctx.lineTo(bx+iw*hp,by+8);ctx.stroke()}ctx.restore();
 const py=H-(W<700?215:62);panel(pad,py,154,38);ctx.fillStyle='#aaa5c0';ctx.font='9px "DM Mono",monospace';ctx.textAlign='left';ctx.fillText('VITALITY',pad+11,py+13);ctx.fillStyle='rgba(87,66,101,.65)';ctx.beginPath();ctx.roundRect(pad+11,py+21,130,7,4);ctx.fill();ctx.fillStyle=player.hp>35?'#8ae1eb':'#ff748e';ctx.beginPath();ctx.roundRect(pad+11,py+21,130*player.hp/player.max,7,4);ctx.fill();ctx.fillStyle='#ddd3f3';ctx.textAlign='right';ctx.fillText(`${Math.ceil(player.hp)}%`,pad+142,py+14);
 if(combo>2&&comboTimer>0){ctx.textAlign='center';ctx.fillStyle='#97eaff';ctx.font='bold 14px "DM Mono",monospace';ctx.fillText(`${combo}× PRECISION`,W/2,H-82)}
 if(W>700){panel(W-pad-185,py,155,38);ctx.font='9px "DM Mono",monospace';ctx.textAlign='left';ctx.fillStyle='#aaa5c0';ctx.fillText('DASH  SPACE',W-pad-173,py+14);ctx.fillStyle=dashReady<=0?'#99e7ff':'#665e7b';ctx.beginPath();ctx.roundRect(W-pad-173,py+22,130*(1-clamp(dashReady/1.15,0,1)),5,3);ctx.fill();ctx.fillStyle='#aaa5c0';ctx.fillText('NOVA  E',W-pad-173,py+34);ctx.fillStyle=novaReady<=0?'#d2a7ff':'#665e7b';ctx.beginPath();ctx.roundRect(W-pad-85,py+31,42*(1-clamp(novaReady/8,0,1)),4,2);ctx.fill()}
}
function drawObjects(){
 for(const r of rings){const p=1-r.life/r.max;ctx.strokeStyle=`hsla(${r.hue},95%,78%,${(1-p)*.6})`;ctx.lineWidth=r.width*(1-p*.45);ctx.beginPath();ctx.arc(r.x,r.y,r.r+p*(r.max>.7?120:55),0,Math.PI*2);ctx.stroke()}
 for(const s of shots){ctx.save();ctx.strokeStyle=`hsla(${s.hue},100%,78%,.78)`;ctx.shadowColor=`hsl(${s.hue},100%,72%)`;ctx.shadowBlur=12;ctx.lineWidth=s.r;ctx.beginPath();ctx.moveTo(s.x-s.vx*.025,s.y-s.vy*.025);ctx.lineTo(s.x,s.y);ctx.stroke();ctx.restore()}
 for(const b of bullets){ctx.save();const h=b.hue;ctx.shadowColor=`hsl(${h},100%,70%)`;ctx.shadowBlur=16;ctx.fillStyle=`hsl(${h},85%,74%)`;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,.8)';ctx.beginPath();ctx.arc(b.x-b.r*.22,b.y-b.r*.22,b.r*.32,0,Math.PI*2);ctx.fill();ctx.restore()}
 for(const p of particles){ctx.fillStyle=`hsla(${p.hue},95%,75%,${clamp(p.life*1.6,0,1)})`;ctx.shadowColor=`hsl(${p.hue},95%,65%)`;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size*clamp(p.life*1.8,0,1),0,Math.PI*2);ctx.fill()}ctx.shadowBlur=0;
 for(const f of floaters){ctx.globalAlpha=clamp(f.life,0,1);ctx.textAlign='center';ctx.font='bold 11px "DM Mono",monospace';ctx.fillStyle=`hsl(${f.hue},95%,80%)`;ctx.shadowColor=`hsl(${f.hue},90%,65%)`;ctx.shadowBlur=10;ctx.fillText(f.text,f.x,f.y);ctx.globalAlpha=1}ctx.shadowBlur=0;
}
function draw(){ctx.save();if(shake>0&&mode!=='menu')ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackground();drawBoss();drawPlayer();drawObjects();ctx.restore();drawHud();if(damageGlow>0){ctx.strokeStyle=`rgba(255,100,147,${damageGlow*1.5})`;ctx.lineWidth=7;ctx.strokeRect(4,4,W-8,H-8)}if(flash>0){ctx.fillStyle=`rgba(226,215,255,${flash*2})`;ctx.fillRect(0,0,W,H);flash=Math.max(0,flash-.016)} }
function frame(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();
