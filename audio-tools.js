'use strict';
async function speechMP3(decoded,normalize=false){
 if(!window.lamejs)throw Error('De MP3-encoder is niet geladen. Vernieuw het spel.');
 const mono=new Float32Array(decoded.length);let peak=0;
 for(let c=0;c<decoded.numberOfChannels;c++){const channel=decoded.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/decoded.numberOfChannels}
 for(const sample of mono){if(!Number.isFinite(sample))throw Error('Dit geluid bevat ongeldige gegevens.');peak=Math.max(peak,Math.abs(sample))}
 if(normalize&&peak<0.0001)throw Error('Deze opname is vrijwel stil. Spreek het woord opnieuw in.');
 const gain=normalize?Math.pow(10,-1/20)/peak:1;
 const pcm=new Int16Array(mono.length);for(let i=0;i<pcm.length;i++){const value=Math.max(-1,Math.min(1,mono[i]*gain));pcm[i]=Math.round(value*(value<0?32768:32767))}
 const encoder=new lamejs.Mp3Encoder(1,decoded.sampleRate,64),parts=[];
 for(let i=0;i<pcm.length;i+=1152){const bytes=encoder.encodeBuffer(pcm.subarray(i,i+1152));if(bytes.length)parts.push(new Int8Array(bytes));if(i%(1152*30)===0)await new Promise(resolve=>setTimeout(resolve,0))}
 const last=encoder.flush();if(last.length)parts.push(new Int8Array(last));
 return new Blob(parts,{type:'audio/mpeg'});
}
function dataBlob(data){const comma=data.indexOf(','),mime=data.slice(5,comma).split(';')[0],raw=atob(data.slice(comma+1)),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
async function compressRecording(data,normalize=false){
 if(!normalize&&/^data:audio\/(mpeg|mp3);/i.test(data))return data;
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw Error('Geluid verwerken is niet beschikbaar in deze browser.');
 const context=new AudioContextClass({sampleRate:44100});
 try{const decoded=await context.decodeAudioData(await dataBlob(data).arrayBuffer());if(decoded.duration>60)throw Error('Gebruik een opname van maximaal één minuut per woord.');return await readData(await speechMP3(decoded,normalize))}
 finally{await context.close()}
}
function normalizeRecording(data){return compressRecording(data,true)}
async function compressedProject(project){
 const copy=JSON.parse(JSON.stringify(project));for(const item of copy.items)if(item.audio)item.audio=await compressRecording(item.audio);return copy;
}
function safeFileName(name){return (name.trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,80)||'opname')}
async function saveOwnFile(blob,name,description){
 if(window.showSaveFilePicker){
  let handle;try{handle=await window.showSaveFilePicker({suggestedName:name})}catch(e){if(e.name==='AbortError')return false;if(e.name!=='SecurityError'&&e.name!=='NotSupportedError')throw e}
  if(handle){const writable=await handle.createWritable();try{await writable.write(typeof blob==='function'?await blob():blob);await writable.close()}catch(e){try{await writable.abort()}catch{}throw e}message(description+' opgeslagen op de gekozen plek. Een gekozen OneDrive-map wordt door OneDrive gesynchroniseerd.');return true}
 }
 const url=URL.createObjectURL(typeof blob==='function'?await blob():blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message(description+' aangeboden als download. Kies je eigen OneDrive-map of verplaats het bestand daarheen.');return false;
}
