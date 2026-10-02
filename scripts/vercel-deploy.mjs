import {execFileSync} from 'node:child_process';

export function vercelDeployArgs(scope) {
  const args=['deploy','--prebuilt','--prod','--yes'];
  const explicit=String(scope ?? '').trim();
  if(explicit)args.push('--scope',explicit);
  return args;
}

export function deployPrebuilt(cwd,{scope,stdio='inherit'}={}) {
  const requestedScope=scope ?? process.env.VERCEL_SCOPE;
  return execFileSync('vercel',vercelDeployArgs(requestedScope),{cwd,stdio});
}
