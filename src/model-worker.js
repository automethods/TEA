import {evaluateProject} from './model.js';
let data,diagnostic;
self.onmessage=({data:message})=>{
 if(message.type==='init'){data=message.data;diagnostic=message.diagnostic;return;}
 try{const model=evaluateProject(data,diagnostic,message.state);self.postMessage({id:message.id,model});}
 catch(e){self.postMessage({id:message.id,error:e.message});}
};
