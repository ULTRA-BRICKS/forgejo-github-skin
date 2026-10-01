/** Shared gallery/evidence deployment boundary. Only the reviewed linked project may
 * receive output; ambient CLI defaults must never select another project or team.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const projectId='prj_hxsrijXn3RG2SQt7AhAuyMASFvuW';
const orgId='team_lKA0l5FGJudwmRlkdeF1h4VD';


export function hasUncommittedSource(cwd) {
  const options={cwd,encoding:'utf8'};
  return Boolean(
    execFileSync('git',['status','--porcelain','--untracked-files=all'],options).trim() ||
    execFileSync('git',['ls-files','--others','--ignored','--exclude-standard','--',
      '.',':(exclude,top)node_modules',':(exclude,top).vercel',':(exclude,top)storybook-static',
      ':(exclude,top)scripts/__pycache__/*.pyc',':(exclude,top)scripts/sharing/__pycache__/*.pyc'],options).trim()
  );
}
export function readLinkedProject(cwd) {
  let project;
  try {
    project=JSON.parse(readFileSync(path.join(cwd,'.vercel/project.json'),'utf8'));
  } catch {
    throw new Error('A valid .vercel/project.json linked to forgejo-ui is required; verify the project link before publishing.');
  }
  if(project?.projectName!=='forgejo-ui'||project.projectId!==projectId||project.orgId!==orgId)
    throw new Error('The linked project must be forgejo-ui in its reviewed team; verify .vercel/project.json before publishing.');
  return project;
}

export function vercelDeployArgs(scope) {
  const args=['deploy','--prebuilt','--prod','--yes'];
  const explicit=String(scope ?? '').trim();
  if(explicit&&explicit!=='inventorems-projects'&&explicit!==orgId)
    throw new Error('Explicit Vercel scope must match the linked forgejo-ui team.');
  if(explicit)args.push('--scope',explicit);
  return args;
}

export function deployPrebuilt(cwd,{scope,stdio='inherit'}={}) {
  const project=readLinkedProject(cwd);
  for(const [key,expected] of [['VERCEL_PROJECT_ID',project.projectId],['VERCEL_ORG_ID',project.orgId]]) {
    if(process.env[key]&&process.env[key]!==expected)
      throw new Error(key+' conflicts with the linked project; remove the override before publishing.');
  }
  const requestedScope=scope ?? process.env.VERCEL_SCOPE;
  return execFileSync('vercel',vercelDeployArgs(requestedScope),{
    cwd,stdio,env:{...process.env,VERCEL_PROJECT_ID:project.projectId,VERCEL_ORG_ID:project.orgId}
  });
}
