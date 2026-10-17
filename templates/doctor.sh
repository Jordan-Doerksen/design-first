#!/bin/sh
# doctor.sh - shim. Finds the design-first kit through the pointer and runs its Doctor.
# Nothing runs this for you: no cron entry, no login item, no timer.
# Exit codes:  0 GREEN   1 RED   2 COULD-NOT-LOOK (that is NOT a pass)
# Any argument is passed through: -Kit, -Json, -Quiet, -ConfigPath, -ClaimsPath. With no arguments
# it ends with a one-line verdict. The pointer is ~/.claude/design-first.json, or DF_POINTER_PATH;
# node reads it, so this file never parses JSON by hand. On Windows the same shim is Doctor.bat.
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  node (Node.js 18 or newer) is not on PATH. Install it from https://nodejs.org or your package manager."
  code=2
else
  node -e "const fs=require('fs'),path=require('path'),os=require('os'),url=require('url');const stop=(m)=>{console.log('');console.log('  '+m);process.exit(2)};const p=process.env.DF_POINTER_PATH||path.join(os.homedir(),'.claude','design-first.json');if(!fs.existsSync(p))stop('No pointer at '+p+'. Run /design-first:adopt in a Claude Code session first.');let kit='';try{kit=String(JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')).pluginRoot??'')}catch(e){stop('The pointer could not be read: '+p+' ('+e.message+')')}if(!kit)stop('The pointer has no pluginRoot: '+p);const s=path.join(kit,'tools','doctor','doctor.mjs');if(!fs.existsSync(s))stop('Doctor is missing at '+s+'. The pointer pluginRoot is stale; start a session so hooks/entry.mjs refreshes it.');process.argv=[process.execPath,s,...process.argv.slice(1)];import(url.pathToFileURL(s).href)" -- "$@"
  code=$?
fi
# With arguments (a script, or -Json) print nothing extra.
[ $# -gt 0 ] && exit $code
echo
case $code in
  0) echo "  GREEN - nothing to do." ;;
  1) echo "  RED - findings above. Every finding is explained in the kit's tools/MANUAL.md." ;;
  2) echo "  COULD NOT LOOK - the Doctor could not check something. That is NOT a pass." ;;
esac
echo
exit $code
