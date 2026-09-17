/** A deliberately small validator/serializer for the DTCG types used here. */
export function flattenTokens(document, prefix=[], inheritedType, result=new Map()) {
  for (const [key,value] of Object.entries(document)) {
    if (key.startsWith('$')) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid token/group ${[...prefix,key].join('.')}`);
    if (/[.{}]/.test(key)) throw Error(`DTCG name contains reserved character: ${key}`);
    const name=[...prefix,key];
    if ('$value' in value) result.set(name.join('.'),{...value,$type:value.$type ?? inheritedType ?? document.$type});
    else flattenTokens(value,name,value.$type ?? document.$type ?? inheritedType,result);
  }
  return result;
}
export function resolveToken(name,tokens,seen=new Set()) {
  if(seen.has(name)) throw Error(`Cyclic token reference ${name}`);
  const t=tokens.get(name); if(!t) throw Error(`Unknown token ${name}`);
  if(typeof t.$value==='string' && /^\{[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\}$/.test(t.$value)) {
    const ref=resolveToken(t.$value.slice(1,-1),tokens,new Set([...seen,name]));
    if(t.$type && t.$type!==ref.$type) throw Error(`Alias type mismatch ${name}`);
    return ref;
  }
  return t;
}
const finite=n=>typeof n==='number' && Number.isFinite(n);
export function validateTokens(document) {
  const tokens=flattenTokens(document);
  if(!tokens.size) throw Error('No tokens');
  for(const name of tokens.keys()) {
    const {$type:type,$value:v}=resolveToken(name,tokens);
    let ok=false;
    switch(type) {
      case 'color':ok=v?.colorSpace==='srgb' && v.components?.length===3 && v.components.every(n=>finite(n)&&n>=0&&n<=1) && finite(v.alpha)&&v.alpha>=0&&v.alpha<=1;break;
      case 'dimension':ok=finite(v?.value)&&['px','rem'].includes(v.unit);break;
      case 'duration':ok=finite(v?.value)&&v.value>=0&&['ms','s'].includes(v.unit);break;
      case 'fontFamily':ok=typeof v==='string'||Array.isArray(v)&&v.length>0&&v.every(s=>typeof s==='string');break;
      case 'fontWeight':ok=finite(v)&&v>=1&&v<=1000;break;
      case 'cubicBezier':ok=Array.isArray(v)&&v.length===4&&v.every(finite)&&v[0]>=0&&v[0]<=1&&v[2]>=0&&v[2]<=1;break;
      case 'number':ok=finite(v);break;
      default:throw Error(`Unsupported type in this project's validator: ${type} (${name})`);
    }
    if(!ok) throw Error(`Invalid ${type} token: ${name}`);
  }
  return tokens;
}
export function cssValue(token) {
  const v=token.$value;
  switch(token.$type) {
    case 'color':return `rgb(${v.components.map(n=>Math.round(n*255)).join(' ')} / ${v.alpha})`;
    case 'dimension':case 'duration':return `${v.value}${v.unit}`;
    case 'fontFamily':return (Array.isArray(v)?v:[v]).map(s=>/^[\w-]+$/.test(s)?s:JSON.stringify(s)).join(', ');
    case 'cubicBezier':return `cubic-bezier(${v.join(', ')})`;
    default:return String(v);
  }
}
