import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root=process.cwd();
const files=fs.readdirSync(root);
const html=files.filter(f=>f.endsWith(".html"));
const js=files.filter(f=>f.endsWith(".js"));

for(const file of js){
  execFileSync(process.execPath,["--check",path.join(root,file)],{stdio:"inherit"});
}

const missing=new Set();
for(const file of html){
  const src=fs.readFileSync(path.join(root,file),"utf8");
  const refs=[...src.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m=>m[1]);
  for(const ref of refs){
    if(!ref || ref.startsWith("#") || /^[a-z]+:/i.test(ref) || ref.startsWith("//")) continue;
    const clean=ref.split("#")[0].split("?")[0];
    if(!clean) continue;
    const target=path.join(root,clean);
    if(!fs.existsSync(target)) missing.add(file+" -> "+clean);
  }
}
if(missing.size){
  console.error("Missing local references:");
  for(const item of missing) console.error(" - "+item);
  process.exit(1);
}
console.log("Static site validation passed: "+html.length+" HTML pages, "+js.length+" JavaScript files.");
