'use strict';
const projectDialog=document.createElement('dialog');
projectDialog.id='projectDialog';
projectDialog.innerHTML=`<header><h2>Mijn luisterprojecten</h2><button id="closeProjects" aria-label="Sluiten">Sluiten</button></header>
<p>Voeg 4 tot 9 afbeeldingen toe. Geef elke afbeelding een woord en spreek het in. Na het toevoegen verschijnen per kaartje de knoppen Inspreken, Normaliseren en Geluid opslaan. Zonder opname gebruikt het spel de computerstem. Het zeedecor blijft behouden.</p>
<label>Naam van het project <input id="projectTitle" maxlength="80" placeholder="Bijvoorbeeld: op de boerderij"></label>
<div class="projectActions"><button id="newProject">Nieuw project</button><label class="fileButton">Project openen<input id="openProject" type="file" accept=".json,application/json"></label><button id="saveProject">Project opslaan (ook in OneDrive)</button></div>
<div class="projectActions"><label class="fileButton">Afbeeldingen toevoegen<input id="addPictures" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><span id="itemCount"></span></div>
<p class="audioHelp">1. Voeg afbeeldingen toe. 2. Spreek bij elk kaartje het woord in en druk op Stop opname. 3. Normaliseer en beluister het geluid. 4. Sla het project op in je eigen OneDrive-map. Alle afbeeldingen en opnamen gaan mee. Geluid wordt opgeslagen als compacte MP3 (mono, 64 kbit/s).</p><div id="projectItems"></div>
<p id="projectMessage" role="status" aria-live="polite"></p>
<footer><button id="activateProject">Klaarzetten om te spelen</button><button id="defaultProject">Zeedieren klaarzetten</button></footer>
<p class="projectNote">Klaarzetten wordt in deze browser onthouden. Sla ook een projectbestand op voor een andere computer of als reservekopie.</p>`;
document.body.append(projectDialog);
const q=s=>projectDialog.querySelector(s);
let draft={format:'luisterproject',version:1,title:'',items:[]},dirty=false,recording=null,preview=null,busy=false;
const clone=p=>JSON.parse(JSON.stringify(p));
const message=t=>q('#projectMessage').textContent=t;
function stopPreview(){if(preview){preview.pause();preview=null}}
function readData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Bestand kon niet worden gelezen.'));r.readAsDataURL(file)})}
function validateProject(p,play=false){
 if(!p||p.format!=='luisterproject'||p.version!==1||typeof p.title!=='string'||p.title.length>80||!Array.isArray(p.items)||p.items.length>9)throw Error('Dit is geen geldig luisterproject.');
 if(play&&(!p.title.trim()||p.items.length<4))throw Error('Geef je project een naam en voeg minimaal vier afbeeldingen toe.');
 const seen=new Set();
 for(const item of p.items){
  if(!item||typeof item.word!=='string'||item.word.length>60||!item.word.trim()||item.word.includes(',')||seen.has(item.word.trim().toLowerCase()))throw Error('Geef elk kaartje een uniek woord, zonder komma.');
  seen.add(item.word.trim().toLowerCase());
  if(typeof item.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image)||item.image.length>12000000)throw Error('Een afbeelding ontbreekt of heeft een ongeldig formaat.');
  if(item.audio!==null&&(typeof item.audio!=='string'||!/^data:(audio\/[a-z0-9.+-]+|video\/mp4)(;codecs=[a-z0-9.,-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(item.audio)||item.audio.length>16000000))throw Error('Een opname heeft een ongeldig formaat.');
 }
 return {format:'luisterproject',version:1,title:p.title.trim(),items:p.items.map(i=>({word:i.word.trim(),image:i.image,audio:i.audio}))};
}
async function verifyImages(p){await Promise.all(p.items.map(i=>new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(Error('Een afbeelding kan niet worden geopend.'));im.src=i.image})))}
function dbAction(mode,value){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('luisterspel-projecten',1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('settings',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('settings');let result;
 const op=mode==='read'?store.get('active'):value?store.put(value,'active'):store.delete('active');op.onsuccess=()=>result=op.result;
 tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Opslaan mislukt'))};};
 request.onblocked=()=>reject(Error('Sluit andere tabbladen van het spel en probeer opnieuw.'));
})}
function allowChange(){return !dirty||confirm('Je hebt wijzigingen. Doorgaan zonder ze eerst in een projectbestand op te slaan?')}
function renderItems(){
 q('#projectTitle').value=draft.title;q('#itemCount').textContent=draft.items.length+' van 9 kaartjes';q('#projectItems').replaceChildren();
 draft.items.forEach((item,index)=>{
  const row=document.createElement('article');row.className='projectItem';
  const im=new Image();im.src=item.image;im.alt=item.word;row.append(im);
  const label=document.createElement('label');label.textContent='Woord '+(index+1);const input=document.createElement('input');input.value=item.word;input.maxLength=60;input.oninput=()=>{item.word=input.value;dirty=true};label.append(input);row.append(label);
  const controls=document.createElement('div');controls.className='itemActions';
  const record=document.createElement('button');record.textContent='🎙 Inspreken';record.onclick=()=>recordItem(item,record);controls.append(record);
  const importLabel=document.createElement('label');importLabel.className='fileButton';importLabel.textContent='Geluid kiezen';const audioInput=document.createElement('input');audioInput.type='file';audioInput.accept='audio/*';audioInput.onchange=()=>safe(async()=>{const file=audioInput.files[0];if(!file)return;if(file.size>10000000)throw Error('Kies een geluidsbestand kleiner dan 10 MB.');const data=await readData(file);validateProject({...draft,items:[{...item,audio:data}]});item.audio=await compressRecording(data);dirty=true;renderItems();message('Geluidsbestand toegevoegd.');});importLabel.append(audioInput);controls.append(importLabel);
  const listen=document.createElement('button');listen.textContent='Beluisteren';listen.disabled=!item.audio;listen.onclick=()=>{stopPreview();preview=new Audio(item.audio);preview.play().catch(()=>message('Deze opname kan hier niet worden afgespeeld. Kies een ander geluidsbestand.'))};controls.append(listen);
  const normalize=document.createElement('button');normalize.textContent='Normaliseren';normalize.disabled=!item.audio;normalize.onclick=()=>safe(async()=>{stopPreview();message('Geluid normaliseren…');const normalized=await normalizeRecording(item.audio);item.audio=normalized;dirty=true;message('Geluid genormaliseerd en opgeslagen als compacte MP3. Beluister het resultaat.');});controls.append(normalize);
  const saveAudio=document.createElement('button');saveAudio.textContent='Geluid opslaan';saveAudio.disabled=!item.audio;saveAudio.onclick=()=>safe(async()=>{item.audio=await compressRecording(item.audio);const blob=dataBlob(item.audio);const subtype=blob.type.split('/')[1];const extension={mpeg:'mp3',mp4:'m4a','x-m4a':'m4a',wave:'wav','x-wav':'wav'}[subtype]||subtype||'webm';await saveOwnFile(blob,safeFileName(item.word)+'.'+extension,'Geluidsbestand');});controls.append(saveAudio);
  const remove=document.createElement('button');remove.textContent='Verwijderen';remove.onclick=()=>{stopPreview();draft.items.splice(index,1);dirty=true;renderItems()};controls.append(remove);row.append(controls);
  const status=document.createElement('small');status.textContent=item.audio?'Opname toegevoegd · normaliseren en los opslaan mogelijk':'Nog geen opname · klik op 🎙 Inspreken';row.append(status);q('#projectItems').append(row);
 });
}
function setBusy(value){busy=value;projectDialog.querySelectorAll('button,input').forEach(el=>el.disabled=value);if(!value)renderItems()}
async function safe(fn){if(recording||busy)return;setBusy(true);try{await fn()}catch(e){message(e.message||'Dit is niet gelukt.')}finally{setBusy(false)}}
async function recordItem(item,button){
 if(recording){recording.recorder.stop();return}
 stopPreview();
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){message('Opnemen is hier niet beschikbaar. Je kunt wel een geluidsbestand kiezen.');return}
 setBusy(true);message('Microfoon openen…');
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  let recorder;try{recorder=new MediaRecorder(stream)}catch(e){stream.getTracks().forEach(t=>t.stop());throw e}
  const chunks=[];recording={recorder,stream};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  let timeout;recorder.onstop=async()=>{clearTimeout(timeout);stream.getTracks().forEach(t=>t.stop());recording=null;try{const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(!blob.size)throw Error('Geen geluid opgenomen. Probeer opnieuw.');message('Opname comprimeren…');item.audio=await compressRecording(await readData(blob));dirty=true;message('Opname bewaard als compact MP3-bestand. Je kunt hem nu beluisteren.')}catch(e){message(e.message)}finally{setBusy(false)}};
  recorder.onerror=()=>{message('Opnemen is mislukt.');if(recorder.state!=='inactive')recorder.stop();else{stream.getTracks().forEach(t=>t.stop());recording=null;setBusy(false)}};
  recorder.start();button.disabled=false;button.textContent='Stop opname';message('Spreek nu: '+item.word);timeout=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop()},30000);
 }catch(e){setBusy(false);message('Geen microfoontoegang. Sta de microfoon toe of kies een geluidsbestand.');}
}
async function applyProject(p){
 cancelRound();sea.classList.remove('playing');start.style.display='flex';slotsEl.replaceChildren();current=[];
 document.querySelectorAll('.levelBtn').forEach(b=>b.disabled=true);
 themeProject=p;names.splice(0,names.length,...(p?p.items.map(i=>i.word):seaNames));
 document.querySelector('#start h1').textContent=p?p.title:'Volgorde in de zee';
 sea.classList.toggle('customProject',!!p);level=3;streak=0;difficultRounds=0;
 await load();
}
const settingsGate=document.createElement('dialog');settingsGate.id='settingsGate';
settingsGate.innerHTML='<form method="dialog"><h2>Instellingen openen</h2><p>Voor de leerkracht: los de som op.</p><label id="gateLabel" for="gateAnswer"></label><input id="gateAnswer" inputmode="numeric" autocomplete="off" required aria-describedby="gateError"><p id="gateError" role="status"></p><button type="submit">Open instellingen</button><button type="button" id="gateCancel">Annuleren</button></form>';
document.body.append(settingsGate);let gateResult=0;
document.querySelector('#projectsBtn').onclick=()=>{const factor=2+Math.floor(Math.random()*8);gateResult=4*factor;settingsGate.querySelector('#gateLabel').textContent='4 × '+factor+' =';settingsGate.querySelector('#gateAnswer').value='';settingsGate.querySelector('#gateError').textContent='';settingsGate.showModal();settingsGate.querySelector('#gateAnswer').focus()};
settingsGate.querySelector('#gateCancel').onclick=()=>settingsGate.close();
settingsGate.querySelector('form').onsubmit=e=>{e.preventDefault();if(settingsGate.querySelector('#gateAnswer').value.trim()!==String(gateResult)){settingsGate.querySelector('#gateError').textContent='Dat klopt nog niet. Probeer opnieuw.';return}settingsGate.close();stopVoice();window.speechSynthesis?.cancel();renderItems();message(themeProject?'Klaargezet: '+themeProject.title:'De zeedieren staan klaar.');projectDialog.showModal()};
q('#closeProjects').onclick=()=>{stopPreview();projectDialog.close()};
projectDialog.addEventListener('cancel',e=>{if(busy||recording)e.preventDefault();else stopPreview()});
q('#projectTitle').oninput=e=>{draft.title=e.target.value;dirty=true};
q('#newProject').onclick=()=>{if(!allowChange())return;stopPreview();draft={format:'luisterproject',version:1,title:'',items:[]};dirty=false;renderItems();message('Nieuw project. Voeg afbeeldingen toe.')};
q('#addPictures').onchange=e=>{const files=[...e.target.files];e.target.value='';safe(async()=>{
 if(files.length+draft.items.length>9)throw Error('Je kunt maximaal negen kaartjes gebruiken.');
 const additions=[];for(const f of files){if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8000000)throw Error('Kies PNG, JPG of WebP-afbeeldingen kleiner dan 8 MB.');let word=f.name.replace(/\.[^.]+$/,'').replaceAll(',',' ').slice(0,55)||'Kaartje';let base=word,n=2;while([...draft.items,...additions].some(i=>i.word.toLowerCase()===word.toLowerCase()))word=base+' '+n++;additions.push({word,image:await readData(f),audio:null})}
 await verifyImages({items:additions});draft.items.push(...additions);dirty=true;message('Afbeeldingen toegevoegd. Pas de woorden aan en spreek ze in.');
 })};
q('#openProject').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file||!allowChange())return;safe(async()=>{if(file.size>150000000)throw Error('Dit projectbestand is te groot.');const p=validateProject(JSON.parse(await file.text()));await verifyImages(p);stopPreview();draft=p;dirty=false;message('Project geopend. Kies Klaarzetten om ermee te spelen.');})};
q('#saveProject').onclick=()=>safe(async()=>{const p=validateProject(draft);if(!p.title)throw Error('Geef het project eerst een naam.');const saved=await saveOwnFile(async()=>new Blob([JSON.stringify(await compressedProject(p))],{type:'application/json'}),safeFileName(p.title)+'.luisterproject.json','Project met afbeeldingen en opnamen');if(saved)dirty=false;});
q('#activateProject').onclick=()=>safe(async()=>{const p=validateProject(draft,true);await verifyImages(p);stopPreview();await applyProject(clone(p));try{await dbAction('write',p);message('Klaargezet: '+p.title+'. Dit project opent voortaan in deze browser.')}catch(e){message('Project klaar voor deze sessie. Onthouden in deze browser lukt niet; sla een projectbestand op.')} });
q('#defaultProject').onclick=()=>safe(async()=>{stopPreview();await applyProject(null);try{await dbAction('write',null);message('De zeedieren staan weer klaar.')}catch(e){message('De zeedieren staan klaar voor deze sessie. De opgeslagen keuze kon niet worden gewist.')} });
window.addEventListener('beforeunload',e=>{if(dirty||recording){e.preventDefault();e.returnValue=''}});
(async()=>{let active=null;try{const saved=await dbAction('read');if(saved){active=validateProject(saved,true);await verifyImages(active);draft=clone(active)}}catch(e){active=null;console.warn('Project niet beschikbaar; zeedieren worden geladen.',e)}await applyProject(active)})();
