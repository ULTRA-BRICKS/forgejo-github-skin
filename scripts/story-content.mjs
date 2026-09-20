/** Bounded browser-side check for the text, image and SVG content used by these stories. */
export function visibleStoryContent() {
  const nontransparent=paint=>{
    if(paint==='none'||paint==='transparent')return false;
    const comma=/^rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)$/.exec(paint),slash=/\/\s*([^)]*)\)$/.exec(paint);
    return !(comma||slash)||parseFloat((comma||slash)[1])>0;
  };
  const root=document.querySelector('#storybook-root');if(!root)return false;
  const memo=new WeakMap();
  const painted=element=>{
    if(!element)return true;if(memo.has(element))return memo.get(element);
    const style=getComputedStyle(element);
    const value=style.display!=='none'&&style.visibility!=='hidden'&&style.contentVisibility!=='hidden'&&Number(style.opacity)>0&&painted(element.parentElement);
    memo.set(element,value);return value;
  };
  if(!painted(root))return false;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,count=0;
  while((node=walker.nextNode())&&count++<400){
    if(!node.textContent.trim()||!painted(node.parentElement))continue;
    const range=document.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(rect=>rect.width>0&&rect.height>0))return true;
  }
  count=0;
  for(const image of root.querySelectorAll('img')){
    if(count++>=400)break;const rect=image.getBoundingClientRect();
    if(painted(image)&&rect.width>0&&rect.height>0&&image.complete&&image.naturalWidth>0)return true;
  }
  count=0;
  for(const shape of root.querySelectorAll('svg :is(path,rect,circle,ellipse,polygon,polyline,line,text,image,use)')){
    if(count++>=400)break;
    if(shape.closest('defs,clipPath,mask,marker,pattern')||!painted(shape))continue;
    const box=shape.getBBox(),style=getComputedStyle(shape);
    const stroke=nontransparent(style.stroke)&&parseFloat(style.strokeWidth)>0&&Number(style.strokeOpacity)>0;
    const fill=nontransparent(style.fill)&&Number(style.fillOpacity)>0;
    if((fill&&box.width>0&&box.height>0)||(stroke&&(box.width>0||box.height>0)))return true;
  }
  return false;
}
