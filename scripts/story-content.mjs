/** Browser-side readiness for textual and graphical stories; empty wrappers do not count. */
export function visibleStoryContent() {
  const root=document.querySelector('#storybook-root');
  if(!root)return false;
  const visible=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;};
  if(!visible(root))return false;
  if(root.innerText.trim())return true;
  for(const image of root.querySelectorAll('img'))if(visible(image)&&image.complete&&image.naturalWidth>0)return true;
  for(const svg of root.querySelectorAll('svg')){
    if(!visible(svg))continue;
    for(const shape of svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,image')){
      const bounds=shape.getBBox();if(bounds.width>0&&bounds.height>0&&visible(shape))return true;
    }
  }
  return false;
}
