import { parseArgs } from "node:util";
import { readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import { Buffer } from "node:buffer";
import { RESEARCH_DOCUMENTS,canonicalResearch,researchTemplate,validateResearchBundle } from "@bunaken/contracts/research";

const {values}=parseArgs({options:{metadata:{type:"string"},results:{type:"string"},documents:{type:"string"},output:{type:"string"},help:{type:"boolean"}}});
if(values.help) {
  process.stdout.write("Usage: node create-research-bundle.mjs --metadata FILE --results FILE --documents DIRECTORY --output NEW_FILE\nOnly creates a local draft bundle; no GitHub write or publication.\n");
} else {
  try {
    if(!values.metadata||!values.results||!values.documents||!values.output)throw new Error();
    const hash=raw=>createHash("sha256").update(raw).digest("hex");
    const metadata=JSON.parse(await readFile(values.metadata,"utf8"));
    const results=JSON.parse(await readFile(values.results,"utf8"));
    const now=new Date().toISOString();
    const release={...metadata,schema_version:"1.0",revision:1,state:"draft",created_at:now,updated_at:now,
      results_sha256:hash(canonicalResearch(results)),reviews:{translation:false,narrative:false,rights:false,real_synthetic:false,results:false},files:{}};
    const documents=Object.fromEntries(await Promise.all(RESEARCH_DOCUMENTS.map(async name=>[name,researchTemplate(release,name)+await readFile(join(values.documents,name),"utf8")])));
    release.files=Object.fromEntries(RESEARCH_DOCUMENTS.map(name=>[name,hash(documents[name])]));
    validateResearchBundle(release,documents,results,hash);
    const encoded=JSON.stringify({release,results,documents,expected_revision:null},null,2)+"\n";
    if(Buffer.byteLength(encoded)>600_000)throw new Error();
    await writeFile(values.output,encoded,{flag:"wx"});
    process.stdout.write("Local research draft bundle validated and created. Reviews remain unconfirmed.\n");
  } catch {
    process.stderr.write("Research bundle invalid, output already exists, or an input file is unavailable.\n");process.exitCode=1;
  }
}
