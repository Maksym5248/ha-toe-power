// Ingress is served on the HA origin, so the iframe can read the host theme.
// Copy every custom property: theme colors often reference other HA tokens.
export function themeSnapshot(sourceWindow) {
  const doc=sourceWindow.document;
  const host=doc.querySelector('home-assistant');
  const values=new Map();
  for(const element of [doc.documentElement,host].filter(Boolean)) {
    const style=sourceWindow.getComputedStyle(element);
    for(let i=0;i<style.length;i++) {
      const name=style[i];
      if(name.startsWith('--')) values.set(name,style.getPropertyValue(name).trim());
    }
  }
  const dark=host?.hass?.themes?.darkMode;
  return {values,dark:typeof dark==='boolean'?dark:sourceWindow.matchMedia('(prefers-color-scheme: dark)').matches};
}
export function connectHomeAssistantTheme(targetWindow=window) {
  let source;
  try {
    source=targetWindow.parent;
    if(source===targetWindow || !source.document.querySelector('home-assistant')) return ()=>{};
  } catch {return ()=>{};} // External iframe origins keep the system-theme fallback.
  const root=targetWindow.document.documentElement;
  let copied=new Set(),frame=null,stopped=false;
  function sync() {
    frame=null;if(stopped)return;
    try {
      const {values,dark}=themeSnapshot(source);
      for(const name of copied) if(!values.has(name)) root.style.removeProperty(name);
      for(const [name,value] of values) if(root.style.getPropertyValue(name)!==value) root.style.setProperty(name,value);
      copied=new Set(values.keys());
      root.dataset.haTheme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';
    } catch { /* Parent can navigate independently of the app. */ }
  }
  function schedule(){if(frame===null)frame=targetWindow.requestAnimationFrame(sync);}
  const observer=new source.MutationObserver(schedule);
  for(const node of [source.document.documentElement,source.document.querySelector('home-assistant')]) {
    try {if(node?.nodeType===1) observer.observe(node,{attributes:true,attributeFilter:['style','class']});} catch { /* Polling below also covers replaced host elements. */ }
  }
  try {if(source.document.head) observer.observe(source.document.head,{childList:true,subtree:true,characterData:true});} catch { /* Same polling fallback. */ }
  const media=source.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',schedule);
  // HA's darkMode is a JS property; a theme may change it without an attribute.
  const timer=targetWindow.setInterval(schedule,1000);
  sync();
  return ()=>{stopped=true;observer.disconnect();media.removeEventListener('change',schedule);targetWindow.clearInterval(timer);if(frame!==null)targetWindow.cancelAnimationFrame(frame);};
}
