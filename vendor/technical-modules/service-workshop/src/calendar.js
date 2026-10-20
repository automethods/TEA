export const SLOT_HOURS=0.5;
// Use UTC as a timezone-neutral representation of the case's local wall clock.
// User-computer timezone must not shift the teaching dates or lunch boundaries.
export function slotStart(s,week='2026-10-05') {
  if(!Number.isInteger(s)||s<0||s>128)return null;
  const day=Math.floor(s/16),within=s%16;
  return Date.parse(week+'T00:00:00Z')+(day+2*Math.floor(day/5))*86400000+(8+within*.5+(within>=8?1:0))*3600000;
}
export function slotEnd(e,week) { return Number.isInteger(e)&&e>0&&e<=128?slotStart(e-1,week)+1800000:null; }
export function stamp(ms) {return Number.isFinite(ms)?new Date(ms).toISOString().slice(0,16):'';}
export function dateText(ms) {return Number.isFinite(ms)?new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'—';}
export function wallTime(s) {const ms=Date.parse(s+'Z');return Number.isFinite(ms)?ms:null;}
export function staffAvailable(staff,slot,calendar) {
  const within=slot%16;
  const c=staff['calendar_'+calendar]??calendar;
  return c==='full'||(c==='morning'&&within<8)||(c==='morning_plus_two'&&within<12);
}
export function overlap(a,b) {return a.start<b.end&&b.start<a.end;}

export function timeToInterval(value){
 if(value==='')return null;const ms=wallTime(value);for(let i=0;i<=128;i++)if(slotStart(i)===ms)return i;
 throw Error('Оберіть робочий час з кроком 30 хв: 08:00–11:30 або 13:00–16:30 у дні кейсу.');
}
