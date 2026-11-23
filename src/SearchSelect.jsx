import React, { useId, useState } from 'react';
export default function SearchSelect({label,options,value,onChange,disabled,placeholder,fallback=''}) {
  const id=useId(), [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const selected=options.find(o=>String(o.value)===String(value));
  const matches=options.filter(o=>o.label.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
  const visible=matches.slice(0,80);
  function choose(option){onChange(option.item);setOpen(false);setQuery('');setActive(0);}
  return <div className="search-select"><label htmlFor={id}>{label}</label><input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&visible[active]?`${id}-${active}`:undefined} disabled={disabled} placeholder={placeholder} value={open?query:(selected?.label||fallback)} onFocus={()=>{setOpen(true);setQuery('');setActive(0);}} onBlur={()=>setOpen(false)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);}} onKeyDown={e=>{
    if(e.key==='Escape'){setOpen(false);return;}
    if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(a=>Math.min(a+1,visible.length-1));}
    if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0));}
    if(e.key==='Enter'&&open&&visible[active]){e.preventDefault();choose(visible[active]);}
  }} />{open&&<div className="search-options" id={`${id}-list`} role="listbox" aria-label={label}>{visible.map((option,i)=><div id={`${id}-${i}`} key={option.value} role="option" aria-selected={String(value)===String(option.value)} className={i===active?'focused':''} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>choose(option)}>{option.label}</div>)}{!visible.length&&<p role="status">Нічого не знайдено</p>}{matches.length>80&&<p className="small">Знайдено {matches.length}. Уточніть назву для коротшого списку.</p>}</div>}</div>;
}
