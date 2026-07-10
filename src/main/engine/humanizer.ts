import type { Locator, Page } from 'playwright';

export type RandomSource = () => number;
export function gaussian(random:RandomSource=Math.random): number {
  const u=Math.max(Number.EPSILON,random()); const v=Math.max(Number.EPSILON,random());
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
export function typingDelayMs(random:RandomSource=Math.random): number {
  const wpm=Math.min(140,Math.max(60,100+gaussian(random)*15));
  return 60_000/(wpm*5);
}
export function thinkDelayMs(random:RandomSource=Math.random): number { return 1000+random()*3000; }
export async function pause(page:Page, random:RandomSource=Math.random):Promise<void> { await page.waitForTimeout(thinkDelayMs(random)); }
export async function humanType(locator:Locator,text:string,random:RandomSource=Math.random):Promise<void> {
  if (text.length>400) { await locator.fill(text); return; }
  for (const char of text) { await locator.pressSequentially(char,{delay:typingDelayMs(random)}); if(random()<0.015) await locator.page().waitForTimeout(300+random()*600); }
}
export async function humanClick(locator:Locator):Promise<void> {
  await locator.scrollIntoViewIfNeeded(); const box=await locator.boundingBox();
  if(box) await locator.page().mouse.move(box.x+box.width*(.42+Math.random()*.16),box.y+box.height*(.42+Math.random()*.16),{steps:8});
  await locator.click();
}
export function jitterDate(date:Date,random:RandomSource=Math.random):Date { return new Date(date.getTime()+Math.round((random()*180-90)*1000)); }
