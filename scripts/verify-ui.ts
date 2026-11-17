import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}});const errors:string[]=[];
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result={title:await page.title(),textLength:(await page.locator('body').innerText()).trim().length,overlay:await page.locator('.vite-error-overlay,#webpack-dev-server-client-overlay,[data-nextjs-dialog]').count(),composer:await page.locator('#post-text').count(),errors};
 if(result.title!=='Handpost'||result.textLength<100||result.overlay||result.composer!==1||errors.length)throw new Error(`UI verification failed: ${JSON.stringify(result)}`);
 await page.getByRole('button',{name:'X',exact:true}).last().click();await page.getByLabel('Continuation posts').waitFor();
 const screens=[['Calendar','July'],['Queue','Publishing queue'],['Accounts','Connected accounts'],['History','Publish history'],['Settings','Settings'],['Composer','Compose once. Publish everywhere.']] as const;
 for(const [button,heading] of screens){await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('heading',{name:heading,exact:button!=='Calendar'}).first().waitFor();}
 await page.getByRole('button',{name:'X',exact:true}).last().click();await page.getByLabel('Continuation posts').fill('Second post\n---\nThird post');await page.screenshot({path:'handpost-ui.png',fullPage:true});
 if(errors.length)throw new Error(`Console errors after navigation: ${JSON.stringify(errors)}`);console.log(`UI verification passed: ${JSON.stringify({...result,screens:screens.length,threadEditor:true})}`);
}finally{await browser.close();}
