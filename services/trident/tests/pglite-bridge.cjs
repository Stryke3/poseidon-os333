const {PGlite} = require('@electric-sql/pglite');
const readline = require('node:readline');
const db = new PGlite();
const decode = value => value && typeof value === 'object' && value.__bytes ? Buffer.from(value.__bytes,'base64') : value;
const encode = value => value instanceof Uint8Array ? {__bytes:Buffer.from(value).toString('base64')} : value;
(async () => {
 await db.waitReady;
 const input = readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 for await (const line of input) {
  try {
   const request=JSON.parse(line); let index=0;
   const sql=request.sql.replace(/%s/g,()=>`$${++index}`);
   const result=index || !sql.trim().includes(';') ? await db.query(sql,(request.params || []).map(decode)) : (await db.exec(sql)).at(-1);
   process.stdout.write(JSON.stringify({rows:result?.rows || [],rowcount:result?.affectedRows || 0,fields:result?.fields || []},(_,v)=>encode(v))+'\n');
  } catch(error) {process.stdout.write(JSON.stringify({error:error.message})+'\n');}
 }
 await db.close();
})();

