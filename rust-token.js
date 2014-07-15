// poor man's impl of token
// a token type is an associated array containing
//   k, the token type (eg PLUS, MINUS, IDENT)
//   v, value, if applicable (eg IDENT name)
//   c, colour for syntax highlighting
var token = {
    // binop
    PLUS: {k: 'PLUS', c: 'rgb(0,200,0)'},
    MINUS: {k: 'MINUS', c: 'rgb(0,200,0)'},
    STAR: {k: 'STAR', c: 'rgb(0,200,0)'},
    SLASH: {k: 'SLASH', c: 'rgb(0,200,0)'},
    PERCENT: {k: 'PERCENT', c: 'rgb(0,200,0)'},
    CARET: {k: 'CARET', c: 'rgb(0,200,0)'},
    AND: {k: 'AND', c: 'rgb(0,200,0)'},
    OR: {k: 'OR', c: 'rgb(0,200,0)'},
    SHL: {k: 'SHL', c: 'rgb(0,200,0)'},
    SHR: {k: 'SHR', c: 'rgb(0,200,0)'},

    EQ: {k: 'EQ', c: 'rgb(0,200,0)'},
    LT: {k: 'LT', c: 'rgb(0,200,0)'},
    LE: {k: 'LE', c: 'rgb(0,200,0)'},
    EQEQ: {k: 'EQEQ', c: 'rgb(0,200,0)'},
    NE: {k: 'NE', c: 'rgb(0,200,0)'},
    GE: {k: 'GE', c: 'rgb(0,200,0)'},
    GT: {k: 'GT', c: 'rgb(0,200,0)'},
    ANDAND: {k: 'ANDAND', c: 'rgb(0,200,0)'},
    OROR: {k: 'OROR', c: 'rgb(0,200,0)'},
    NOT: {k: 'NOT', c: 'rgb(0,200,0)'},
    TILDE: {k: 'TILDE', c: 'rgb(0,200,0)'},
    BINOP: function(op) { return {k: 'BINOP', v: op.k, c: op.c}; },
    BINOPEQ: function(op) { return {k: 'BINOPEQ', v: op.k, c: op.c}; },

    AT: {k: 'AT', c: 'rgb(0,200,0)'},
    DOT: {k: 'DOT', c: 'rgb(0,200,0)'},
    DOTDOT: {k: 'DOTDOT', c: 'rgb(0,200,0)'},
    DOTDOTDOT: {k: 'DOTDOTDOT', c: 'rgb(0,200,0)'},
    COMMA: {k: 'COMMA', c: 'rgb(0,200,0)'},
    SEMI: {k: 'SEMI', c: 'rgb(0,200,0)'},
    COLON: {k: 'COLON', c: 'rgb(0,200,0)'},
    MOD_SEP: {k: 'MOD_SEP', c: 'rgb(0,200,0)'},
    RARROW: {k: 'RARROW', c: 'rgb(0,200,0)'},
    LARROW: {k: 'LARROW', c: 'rgb(0,200,0)'},
    DARROW: {k: 'DARROW', c: 'rgb(0,200,0)'},
    FAT_ARROW: {k: 'FAT_ARROW', c: 'rgb(0,200,0)'},
    LPAREN: {k: 'LPAREN', c: 'rgb(0,200,0)'},
    RPAREN: {k: 'RPAREN', c: 'rgb(0,200,0)'},
    LBRACKET: {k: 'LBRACKET', c: 'rgb(0,200,0)'},
    RBRACKET: {k: 'RBRACKET', c: 'rgb(0,200,0)'},
    LBRACE: {k: 'LBRACE', c: 'rgb(0,200,0)'},
    RBRACE: {k: 'RBRACE', c: 'rgb(0,200,0)'},
    POUND: {k: 'POUND', c: 'rgb(0,200,0)'},
    DOLLAR: {k: 'DOLLAR', c: 'rgb(0,200,0)'},

    LIT_CHAR: function(c) { return {k: 'LIT_CHAR', v: c, c: 'rgb(0,200,200)'}; },
    LIT_INT: function(x, tp) { return {k: 'LIT_INT', v: x, tp: tp, c: 'rgb(200,0,0)'}; },
    LIT_UINT: function(x, tp) { return {k: 'LIT_UINT', v: x, tp: tp, c: 'rgb(200,0,0)'}; },
    LIT_INT_UNSUFFIXED: function(x) { return {k: 'LIT_INT_UNSUFFIXED', v: x, c: 'rgb(200,0,0)'}; },
    LIT_FLOAT: function(x, tp) { return {k: 'LIT_FLOAT', v: x, tp: tp, c: 'rgb(100,0,0)'}; },
    LIT_FLOAT_UNSUFFIXED: function(x) { return {k: 'LIT_FLOAT_UNSUFFIXED', v: x, c: 'rgb(100,0,0)'}; },
    LIT_STR: function(x) { return {k: 'LIT_STR', v: x, c: 'rgb(0,100,100)'}; },
    LIT_STR_RAW: function(x, n) { return {k: 'LIT_STR_RAW', v: x, n: n, c: 'rgb(0,150,150)'}; },

    UNDERSCORE: {k: 'UNDERSCORE', c: 'rgb(0,200,0)'},
    LIFETIME: function(x) { return {k: 'LIFETIME', v: x, c: 'rgb(0,0,100)'}; },
    DOC_COMMENT: function(x) { return {k: 'DOC_COMMENT', v: x, c: 'rgb(50,50,50)'}; },
    IDENT: function(x, is_mod) { var t = {k: 'IDENT', v: x, is_mod: is_mod}; t['c'] = (!is_mod && token.is_any_keyword(t)) ? '#803C8D' : '#256EB8'; return t; },
    EOF: {k: 'EOF', c: 'rgb(0,0,0)'}
};

token.keywords = {
    As: 'as',
    Break: 'break',
    Const: 'const',
    Do: 'do',
    Else: 'else',
    Enum: 'enum',
    Extern: 'extern',
    False: 'false',
    Fn: 'fn',
    For: 'for',
    If: 'if',
    Impl: 'impl',
    In: 'in',
    Let: 'let',
    __LogLevel: '__log_level',
    Loop: 'loop',
    Match: 'match',
    Mod: 'mod',
    Mut: 'mut',
    Once: 'once',
    Priv: 'priv',
    Pub: 'pub',
    Ref: 'ref',
    Return: 'return',
    Static: 'static',
    Self: 'self',
    Struct: 'struct',
    Super: 'super',
    True: 'true',
    Trait: 'trait',
    Type: 'type',
    Unsafe: 'unsafe',
    Use: 'use',
    While: 'while',
    Continue: 'continue',
    Proc: 'proc',
    Alignof: 'alignof',
    Be: 'be',
    Offsetof: 'offsetof',
    Pure: 'pure',
    Sizeof: 'sizeof',
    Typeof: 'typeof',
    Yield: 'yield'
};

token.is_any_keyword = function(tok) {
    for (var i in token.keywords) {
        if (tok.k === 'IDENT' && tok.v === token.keywords[i]) return true;
    }
    return false;
};

token.is_keyword = function(kw, tok) {
    return (tok.k === 'IDENT' && tok.v === kw);
};

token.toString = function(tok) {
    // remove noisy colour key
    var o = {};
    for (var k in tok) {
        if (k === 'c') continue;
        o[k] = tok[k];
    }
    return JSON.stringify(o);
};
