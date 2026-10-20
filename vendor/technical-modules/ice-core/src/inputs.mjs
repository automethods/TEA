export function validateInputs(candidate,metadata) {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)) throw new Error('Очікується об’єкт параметрів.');
  if(Object.keys(candidate).length!==metadata.length) throw new Error('Неповний набір параметрів або зайві поля.');
  for(const m of metadata) {
    const v=candidate[m.key];
    if(typeof v!=='number'||!Number.isFinite(v)||v<m.min||v>m.max) throw new Error(`${m.label}: допустимо ${m.min} … ${m.max} ${m.unit}.`);
  }
  const p={...candidate};
  if(!Number.isInteger(p.cylinders)||!Number.isInteger(p.maxCycles)) throw new Error('Кількість циліндрів і повторів має бути цілою.');
  if(p.rod<=p.stroke/2) throw new Error('Довжина шатуна має перевищувати радіус кривошипа.');
  if(p.soc<=p.ivc||p.soc+p.duration>=p.evo) throw new Error('Згоряння має повністю відбуватися між закриттям впуску і відкриттям випуску.');
  return p;
}
