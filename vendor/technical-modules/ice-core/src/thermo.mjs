/** Явна ефективна, а не хімічно рівноважна модель робочого тіла. SI. */
export const GAS_R=287;
export const CV_A=675, CV_B=0.25;
export const cv=T=>CV_A+CV_B*T;
export const u=T=>CV_A*T+CV_B*T*T/2;
export const enthalpy=T=>u(T)+GAS_R*T;
export const gamma=T=>1+GAS_R/cv(T);
export function temperature(specificU) {
  if(!(specificU>0 && Number.isFinite(specificU))) throw new Error('Неприпустима внутрішня енергія; зменште крок інтегрування.');
  return 2*specificU/(CV_A+Math.sqrt(CV_A*CV_A+2*CV_B*specificU));
}
/** Витрата від 1 до 2; резервуар вважається нерухомим. Повертає невід’ємну величину. */
export function orifice(pUp,TUp,pDown,area,cd) {
  if(area<=0 || pUp<=pDown) return 0;
  if(!(pUp>0&&pDown>0&&TUp>0&&cd>=0)) throw new Error('Некоректні граничні умови сопла.');
  const k=gamma(TUp), ratio=pDown/pUp, crit=(2/(k+1))**(k/(k-1));
  const psi=ratio<=crit ? Math.sqrt(k)*(2/(k+1))**((k+1)/(2*(k-1))) :
    Math.sqrt(Math.max(0,2*k/(k-1)*(ratio**(2/k)-ratio**((k+1)/k))));
  return cd*area*pUp/Math.sqrt(GAS_R*TUp)*psi;
}
export function valveArea(deg,open,close,d,lift,count) {
  if(deg<=open || deg>=close) return 0;
  const h=lift*Math.sin(Math.PI*(deg-open)/(close-open))**2;
  return count*Math.min(Math.PI*d*h,Math.PI*d*d/4);
}
/** Нормована функція Вібе; etaComb задає неповноту окремо від форми кривої. */
export function burn(deg,p) {
  const y=(deg-p.soc)/p.duration, a=p.wiebeA,m=p.wiebeM;
  if(y<=0) return {x:0,dx:0};
  if(y>=1) return {x:1,dx:0};
  const e=Math.exp(-a*y**(m+1)), norm=-Math.expm1(-a);
  return {x:(1-e)/norm,dx:a*(m+1)*y**m*e/(norm*p.duration)};
}
export function heatCoefficient(pressure,T,V,p) {
  // Hohenberg: p у bar, V у m³, T у K, середня швидкість у m/s.
  const cm=p.stroke*p.rpm/30;
  return p.heatMultiplier*130*(pressure/1e5)**0.8*T**(-0.4)*V**(-0.06)*(cm+1.4)**0.8;
}
