import {$,escape as e,toast} from './shared.js';
let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
window.addEventListener('appinstalled',()=>{installPrompt=null;toast('Church office installed.');});
document.addEventListener('click',event=>{
  if(!event.target.closest('[data-install-office]'))return;
  let dialog=$('#install-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='install-dialog';document.body.append(dialog);}
  dialog.setAttribute('aria-labelledby','install-title');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="install-title">Your church office, on your desktop.</h2><button id="close-install" aria-label="Close installation help">×</button></div><div class="dialog-body"><h3>Install on Windows</h3><p>Download the setup wizard for Windows 10 or 11. It adds desktop and Start-menu shortcuts, connection settings, and an uninstall entry.</p><a class="btn" href="/downloads/VWO-Church-Office-Setup.exe" download>Download Windows installer ↓</a><p>When asked for the server address, enter:</p><p class="notice"><strong>${e(location.origin)}</strong>${['localhost','127.0.0.1'].includes(location.hostname)?'<br>This address works only on this development computer. Other computers need your hosted church address.':''}</p><h3>Other supported desktops</h3><p>Install this website as an app using a compatible browser, such as Chrome or Edge, on Windows, macOS, or Linux. Use the browser’s “Install app” option if no install button is shown below.</p>${installPrompt?'<button class="btn outline" id="browser-install">Install browser app</button>':''}<p class="account-note">All versions connect to the same church server. Internet access is required; member records are not stored for offline use. The Windows package is unsigned and may show a publisher warning.</p></div>`;
  $('#close-install').onclick=()=>dialog.close();
  if($('#browser-install'))$('#browser-install').onclick=async()=>{try{await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;dialog.close();}catch{toast('Use the install option in your browser menu.');}};
  dialog.showModal();
});
