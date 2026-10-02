// Progressive enhancement: failed saves retain the user's input in this tab only.
export const setupUi = `
const form=document.querySelector('form[action="/configure"]');
const feedback=document.getElementById('setup-feedback');
async function refreshCsrf(){
  try{
    const response=await fetch('/',{credentials:'same-origin',signal:AbortSignal.timeout(8000)});
    const html=await response.text();
    const match=html.match(/name="csrf" value="([a-f0-9]{64})"/);
    const csrfInput=form.querySelector('input[name="csrf"]');
    if(match&&csrfInput)csrfInput.value=match[1];
  }catch{}
}
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=form.querySelector('button[type="submit"]');
  if(submit.disabled)return;
  submit.disabled=true;submit.textContent='Checking Slack connection…';
  feedback.textContent='Checking the bot and workspace. Your keys are not logged.';
  feedback.dataset.state='pending';
  try{
    const response=await fetch('/configure',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(new FormData(form)),signal:AbortSignal.timeout(12000)});
    if(!response.ok){const error=await response.text();throw new Error(error.slice(0,240)||'Connection was not saved. Retry.');}
    form.querySelectorAll('input[type="password"]').forEach(input=>input.value='');
    feedback.textContent='Saved locally. The service reloads its connection automatically. Event delivery must still be verified.';
    feedback.dataset.state='saved';submit.textContent='Connection saved';
  }catch(error){
    // The CSRF token embedded in the form can go stale (session expiry, a
    // reused/cleared cookie); without a fresh one every retry would repeat
    // the same rejection forever, indistinguishable from a real Slack error.
    await refreshCsrf();
    feedback.textContent=error.name==='TimeoutError'?'The check timed out. Your input is still here; retry.':error.message;
    feedback.dataset.state='error';submit.disabled=false;submit.textContent='Retry save';
  }
});
`;
