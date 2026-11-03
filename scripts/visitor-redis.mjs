// Ephemeral CI-only Upstash-compatible transport backed by real Redis.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
function command(args) {
  const raw=execFileSync('redis-cli',['-h','127.0.0.1','-p','6379','--json',...args.map(String)],{encoding:'utf8'}).trim();
  if(raw.startsWith('error:'))throw new Error(raw);
  return JSON.parse(raw);
}
createServer(async(req,res)=>{
  try {
    let body='';for await(const chunk of req)body+=chunk;
    const parts=new URL(req.url,'http://127.0.0.1').pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let value;
    if(parts[0]==='pipeline')value=JSON.parse(body).map(args=>{try{return {result:command(args)}}catch(e){return {error:e.message}}});
    else {
      let args=parts.length?parts:JSON.parse(body);
      if(parts.length&&body)args=[...parts,body];
      value={result:command(args)};
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));
  }catch(e){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:e.message}));}
}).listen(6380,'127.0.0.1');
