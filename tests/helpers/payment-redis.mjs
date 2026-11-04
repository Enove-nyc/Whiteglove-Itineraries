import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// Execute the application's actual Lua, with deterministic Redis/cjson fixtures.
const quote = s => JSON.stringify(s);
function lua(v) {
  if (v === null) return 'cjson.null';
  if (Array.isArray(v)) return 'array({' + v.map(lua).join(',') + '})';
  if (typeof v === 'object') return '{' + Object.entries(v).map(([k,x])=>'['+quote(k)+']='+lua(x)).join(',') + '}';
  return JSON.stringify(v);
}
export function evalLua(command, state) {
 const [,script,count,...rest]=command;
 const keys=rest.slice(0,Number(count)); const args=rest.slice(Number(count)).map(String);
 const decodes={};for(const value of Object.values(state)){try{decodes[value]=JSON.parse(value)}catch{}}
 const prelude=`
local ARRAY = {}
local function array(t) return setmetatable(t, ARRAY) end
cjson = { null = {} }
local function quote(s)
  return '"' .. s:gsub('[%z\\1-\\31\\\\"]', function(c)
    if c == '"' then return '\\\\"' end
    if c == '\\\\' then return '\\\\\\\\' end
    return string.format('\\\\u%04x', string.byte(c))
  end) .. '"'
end
function cjson.encode(value)
 if value == cjson.null then return 'null' end
 if type(value) == 'string' then return quote(value) end
 if type(value) == 'number' or type(value) == 'boolean' then return tostring(value) end
 local parts = {}
 if getmetatable(value) == ARRAY or #value > 0 then
  for _, v in ipairs(value) do parts[#parts+1] = cjson.encode(v) end
  return '[' .. table.concat(parts, ',') .. ']'
 end
 for k,v in pairs(value) do parts[#parts+1] = quote(k) .. ':' .. cjson.encode(v) end
 table.sort(parts)
 return '{' .. table.concat(parts, ',') .. '}'
end
local state = ${lua(state)}
local decoded = ${lua(decodes)}
function cjson.decode(raw)
 if decoded[raw] == nil then error('invalid JSON') end
 return decoded[raw]
end
redis = {}
function redis.error_reply(message) error(message) end
function redis.call(op, ...)
 local a = {...}
 if op == 'GET' then return state[a[1]] or false end
 if op == 'EXISTS' then return state[a[1]] and 1 or 0 end
 if op == 'SET' then state[a[1]]=a[2]; return 'OK' end
 if op == 'MSET' then for i=1,#a,2 do state[a[i]]=a[i+1] end; return 'OK' end
 error('unsupported command ' .. op)
end
KEYS = ${lua(keys)}
ARGV = ${lua(args)}
local function run()
${script}
end
local ok, result = pcall(run)
io.write(cjson.encode({ state = state, ok = ok, result = tostring(result) }))
`;
 const dir=mkdtempSync(path.join(tmpdir(),'paid-lua-'));
 try {const file=path.join(dir,'run.lua');writeFileSync(file,prelude);const child=spawnSync('texlua',[file],{encoding:'utf8'});if(child.status !== 0) throw new Error(child.stderr || child.stdout || String(child.error));const result=JSON.parse(child.stdout);Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,result.state);if(!result.ok)throw new Error(result.result);return /^-?\d+$/.test(result.result)?Number(result.result):result.result;} finally {rmSync(dir,{recursive:true,force:true});}
}

/** @param {Record<string, string>} initial */
export function paymentRedisFixture(initial = {}) {
 const state = { ...initial };
 const port = process.env.PAYMENT_TEST_REDIS_PORT;
 function native(command) {
   const child = spawnSync('redis-cli', ['-h','127.0.0.1','-p',port,'--json',...command.map(String)], {encoding:'utf8'});
   if(child.status !== 0) throw new Error(child.stderr || child.stdout);
   const output=child.stdout.trim();
   if(output.startsWith('error:')) throw new Error(output);
   return JSON.parse(output);
 }
 if(port) {
   if(!/^\d{4,5}$/.test(port)) throw new Error('Invalid local Redis test port');
   native(['FLUSHDB']);
   for(const [k,v] of Object.entries(state)) native(['SET',k,v]);
 }
 function execute(command) {
   if(port) {
     const result=native(command);
     Object.keys(state).forEach(k=>delete state[k]);
     for(const key of native(['KEYS','*']))state[key]=native(['GET',key]);
     return result;
   }
   if(command[0]==='GET') return state[command[1]] ?? null;
   if(command[0]==='SET') { state[command[1]]=String(command[2]); return 'OK'; }
   if(command[0]==='EVAL') return evalLua(command,state);
   throw new Error('Unsupported fixture command');
 }
 return {state,execute};
}

// The required CI job always supplies Redis. Other developers may opt into the
// integration cases with a local Redis port or an installed LuaTeX interpreter.
export function paymentRedisAvailable() {
  return Boolean(process.env.PAYMENT_TEST_REDIS_PORT) || spawnSync('texlua', ['--version'], {encoding:'utf8'}).status === 0;
}
