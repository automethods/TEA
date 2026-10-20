/** Центрований КШМ; кути зовнішнього API у градусах, похідні у радіанах. */
export const RAD = Math.PI / 180;
export function geometry(p, deg) {
  const t = deg * RAD, r = p.stroke / 2, l = p.rod;
  const s = Math.sin(t), c = Math.cos(t), q = Math.sqrt(l*l-r*r*s*s);
  const area = Math.PI*p.bore*p.bore/4, vd=area*p.stroke, vc=vd/(p.compression-1);
  const x = r*(1-c)+l-q;
  const dx = r*s+r*r*s*c/q;
  const d2x = r*c+r*r*(c*c-s*s)/q+r**4*s*s*c*c/q**3;
  const omega = 2*Math.PI*p.rpm/60;
  return {area,vd,vc,x,V:vc+area*x,dV:area*dx*RAD,dx,d2x,
    velocity:omega*dx,acceleration:omega*omega*d2x,beta:Math.asin(r/l*s),
    wallArea:2*area+Math.PI*p.bore*x,omega};
}
export function trapz(rows, y, x) {
  let sum=0;
  for(let i=1;i<rows.length;i++) sum+=(y(rows[i])+y(rows[i-1]))/2*(x(rows[i])-x(rows[i-1]));
  return sum;
}
