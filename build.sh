#!/bin/bash
OUTFILE="dust.js"

# sudo npm install uglify-js -g
uglifyjs rust-shim.js rust-token.js rust-lexer.js util.js hm.js context.js astnodes.js rustish-parser-i.js backlit.js -o $OUTFILE -c -m

echo generated $OUTFILE
