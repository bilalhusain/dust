dust
===

Dust is a programming language that compiles to JavaScript and runs on your browser. Its similarity to Rust is not coincidental. It is actually derived from the Rust to JavaScript transpiler [project](http://bilalhusain.com/rust-lexer/syntax.html).

Try it at http://bilalhusain.github.io/dust/

Using with nodejs
---

Install npm package dust-lang

    npm install dust-lang

Compile input file

    echo 'console::log("hello");' > hello.ds
    ./node_modules/dust-lang/dustc hello.ds > hello.js
    node hello.js
